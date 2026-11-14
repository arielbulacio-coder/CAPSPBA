// Ingreso del paciente con Mi Argentina (plataforma Autenticar, OpenID Connect).
// Documentación: https://argob.github.io/mi-argentina-docs/
//
// Flujo (Authorization Code, el client_secret nunca sale del servidor):
//  1. La app abre /miArgentinaInicio?volver=<url de la app>.
//  2. Se redirige a Mi Argentina (/authorize/) con state y nonce.
//  3. Mi Argentina vuelve a /miArgentinaRetorno con el código. Se canjea en /token/,
//     se leen los datos en /userinfo/ y se exige identidad validada (validation_level).
//  4. Se busca al paciente por DNI en el padrón de la red y se deja un código de un
//     solo uso (2 minutos). La app lo canjea con `canjearIngresoMiArgentina` por un
//     token de Firebase con rol "paciente": las reglas sólo le dejan ver su historia.
import { randomBytes } from 'node:crypto'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError } from 'firebase-functions/v2/https'

const VIGENCIA_ESTADO_MS = 10 * 60_000
const VIGENCIA_CODIGO_MS = 2 * 60_000
// Scopes documentados: `optional` trae dni_number, cuil y validation_level.
const SCOPES = 'openid profile optional'

const aleatorio = () => randomBytes(24).toString('base64url')

// ---------- Validaciones puras (con pruebas en test/) ----------

/** Sólo se vuelve a orígenes configurados, para no ser un redirector abierto. */
export function urlDeVuelta(volver, origenes) {
  try {
    const u = new URL(volver)
    if (!origenes.includes(u.origin)) return null
    u.hash = ''
    u.search = ''
    return u.toString()
  } catch {
    return null
  }
}

/** DNI de la persona: `dni_number` o, si no viene, el que contiene el CUIL (XX-DNI-X). */
export function dniDeClaims(c) {
  const directo = String(c.dni_number ?? '').replace(/\D/g, '')
  if (directo.length >= 7 && directo.length <= 8) return directo.replace(/^0+/, '')
  const cuil = String(c.cuil ?? '').replace(/\D/g, '')
  if (cuil.length === 11) return cuil.slice(2, 10).replace(/^0+/, '')
  return null
}

/** Revisa los datos de Mi Argentina. Devuelve un código de error o null. */
export function revisarClaims(c, nivelMinimo) {
  if (!c) return 'sin_datos'
  if (Number(c.validation_level ?? 0) < nivelMinimo) return 'identidad_no_validada'
  if (c.do_dni_match_cuil === false) return 'dni_no_coincide'
  if (!dniDeClaims(c)) return 'sin_dni'
  return null
}

/** Payload de un JWT. Alcanza sin verificar la firma porque llega directo del endpoint /token/ por TLS (OIDC Core 3.1.3.7). */
export function payloadJWT(jwt) {
  const parte = String(jwt ?? '').split('.')[1]
  if (!parte) return null
  try {
    return JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

// ---------- Endpoints ----------

export function crearIngreso({ base, clientId, redirectUri, origenes }) {
  return async (req, res) => {
    const volver = urlDeVuelta(String(req.query.volver ?? ''), origenes())
    if (!volver) {
      res.status(400).send('Origen no permitido.')
      return
    }
    if (!clientId() || !redirectUri()) {
      res.redirect(303, `${volver}#/paciente/ingreso?error=no_configurado`)
      return
    }
    const state = aleatorio()
    const nonce = aleatorio()
    await getFirestore().doc(`oidcEstados/${state}`).set({ volver, nonce, creado: Date.now() })
    const url = new URL('/authorize/', base())
    url.search = new URLSearchParams({ client_id: clientId(), redirect_uri: redirectUri(), response_type: 'code', scope: SCOPES, state, nonce }).toString()
    res.redirect(303, url.toString())
  }
}

export function crearRetorno({ base, clientId, clientSecret, redirectUri, nivelMinimo }) {
  return async (req, res) => {
    const state = String(req.query.state ?? '')
    const fs = getFirestore()
    const ref = state ? fs.doc(`oidcEstados/${state}`) : null
    const guardado = ref ? await ref.get() : null
    if (!guardado?.exists) {
      res.status(400).send('El ingreso venció o no es válido. Volvé a la app e intentá de nuevo.')
      return
    }
    await ref.delete()
    const { volver, nonce, creado } = guardado.data()
    const fallar = (error) => res.redirect(303, `${volver}#/paciente/ingreso?error=${encodeURIComponent(error)}`)

    if (Date.now() - creado > VIGENCIA_ESTADO_MS) return fallar('vencido')
    if (req.query.error) return fallar(req.query.error === 'access_denied' ? 'cancelado' : 'mi_argentina')
    if (!req.query.code) return fallar('mi_argentina')

    try {
      // Canje del código (servidor a servidor).
      const r = await fetch(new URL('/token/', base()), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri(),
          code: String(req.query.code), grant_type: 'authorization_code',
        }),
      })
      if (!r.ok) throw new Error(`token ${r.status}`)
      const tokens = await r.json()
      const idToken = payloadJWT(tokens.id_token)
      if (idToken && idToken.nonce && idToken.nonce !== nonce) return fallar('mi_argentina')
      if (idToken?.aud && ![].concat(idToken.aud).includes(clientId())) return fallar('mi_argentina')

      const u = await fetch(new URL('/userinfo/', base()), { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' } })
      if (!u.ok) throw new Error(`userinfo ${u.status}`)
      const claims = { ...(idToken ?? {}), ...(await u.json()) }

      const problema = revisarClaims(claims, nivelMinimo())
      if (problema) return fallar(problema)
      const dni = dniDeClaims(claims)

      // Paciente de la red con ese DNI (si su registro se unificó, el principal).
      const encontrados = await fs.collection('pacientes').where('dni', '==', dni).limit(1).get()
      let paciente = encontrados.docs[0]?.data()
      if (paciente?.fusionadoCon) paciente = (await fs.doc(`pacientes/${paciente.fusionadoCon}`).get()).data()
      if (!paciente) {
        // También puede estar registrado con un DNI anterior que se corrigió al unificar.
        const previos = await fs.collection('pacientes').where('dnisAnteriores', 'array-contains', dni).limit(1).get()
        paciente = previos.docs[0]?.data()
      }
      if (!paciente) return fallar('no_registrado')
      if (claims.birthdate && paciente.fechaNac && String(claims.birthdate).slice(0, 10) !== paciente.fechaNac) {
        logger.warn('Fecha de nacimiento distinta entre Mi Argentina y la red', { pacienteId: paciente.id })
        return fallar('datos_distintos')
      }

      const codigo = aleatorio()
      await fs.doc(`ingresos/${codigo}`).set({
        pacienteId: paciente.id, dni, cuil: claims.cuil ?? null, nivel: Number(claims.validation_level),
        expira: Date.now() + VIGENCIA_CODIGO_MS, creado: FieldValue.serverTimestamp(),
      })
      res.redirect(303, `${volver}#/paciente/ingreso?codigo=${codigo}`)
    } catch (e) {
      logger.error('Error en el ingreso con Mi Argentina', e)
      fallar('mi_argentina')
    }
  }
}

/** Canjea el código de un solo uso por un token de Firebase con rol "paciente". */
export async function canjearIngreso(codigo) {
  if (typeof codigo !== 'string' || !codigo) throw new HttpsError('invalid-argument', 'Falta el código.')
  const fs = getFirestore()
  const ref = fs.doc(`ingresos/${codigo}`)
  const datos = await fs.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return null
    tx.delete(ref)
    return s.data()
  })
  if (!datos || datos.expira < Date.now()) throw new HttpsError('not-found', 'El ingreso venció. Volvé a ingresar con Mi Argentina.')
  const paciente = (await fs.doc(`pacientes/${datos.pacienteId}`).get()).data()
  if (!paciente) throw new HttpsError('not-found', 'No encontramos tu registro en la red.')
  const uid = `miarg-${datos.cuil ?? datos.dni}`
  const token = await getAuth().createCustomToken(uid, { rol: 'paciente', pacienteId: paciente.id, dni: datos.dni, nivel: datos.nivel, via: 'mi-argentina' })
  return { token, paciente: { id: paciente.id, nombre: paciente.nombre, capsId: paciente.capsId } }
}
