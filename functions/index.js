// Cloud Functions de Red CAPS (región São Paulo, la más cercana a la Provincia).
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { defineInt, defineSecret, defineString } from 'firebase-functions/params'
import { canjearIngreso, crearIngreso, crearRetorno } from './miargentina.js'
import { validarTurno } from './turnos.js'

initializeApp()
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 })

// ---------- Configuración (firebase deploy la pide la primera vez) ----------
// Las credenciales de Mi Argentina las otorga la Secretaría de Innovación Pública
// a pedido del organismo (por GDE o nota), indicando la URI de redirección.
const MIARG_URL = defineString('MIARG_URL', { default: 'https://id.argentina.gob.ar', description: 'URL base de Mi Argentina (Autenticar)' })
const MIARG_CLIENT_ID = defineString('MIARG_CLIENT_ID', { default: '', description: 'client_id otorgado por Mi Argentina (vacío = ingreso deshabilitado)' })
const MIARG_CLIENT_SECRET = defineSecret('MIARG_CLIENT_SECRET')
const MIARG_REDIRECT_URI = defineString('MIARG_REDIRECT_URI', {
  default: 'https://southamerica-east1-capspba-560af.cloudfunctions.net/miArgentinaRetorno',
  description: 'URI de redirección registrada en Mi Argentina (la URL de miArgentinaRetorno)',
})
const MIARG_NIVEL_MINIMO = defineInt('MIARG_NIVEL_MINIMO', { default: 3, description: 'Nivel de validación de identidad exigido (3 = validada)' })
const APP_ORIGENES = defineString('APP_ORIGENES', {
  default: 'http://localhost:5173,http://localhost:4173',
  description: 'Orígenes de la app a los que se puede volver, separados por coma (ej. https://usuario.github.io)',
})

const origenes = () => APP_ORIGENES.value().split(',').map((s) => s.trim()).filter(Boolean)

// ---------- Turnos: el servidor es la autoridad sobre el cupo protegido ----------

export const validarTurnoDerivacion = onDocumentWritten('derivaciones/{id}', async (event) => {
  const antes = event.data?.before?.exists ? event.data.before.data() : null
  const despues = event.data?.after?.exists ? event.data.after.data() : null
  await validarTurno(event.params.id, antes, despues)
})

// ---------- Ingreso del paciente con Mi Argentina ----------

export const miArgentinaInicio = onRequest(
  crearIngreso({ base: () => MIARG_URL.value(), clientId: () => MIARG_CLIENT_ID.value(), redirectUri: () => MIARG_REDIRECT_URI.value(), origenes }),
)

export const miArgentinaRetorno = onRequest(
  { secrets: [MIARG_CLIENT_SECRET] },
  crearRetorno({
    base: () => MIARG_URL.value(),
    clientId: () => MIARG_CLIENT_ID.value(),
    clientSecret: () => MIARG_CLIENT_SECRET.value(),
    redirectUri: () => MIARG_REDIRECT_URI.value(),
    nivelMinimo: () => MIARG_NIVEL_MINIMO.value(),
  }),
)

export const canjearIngresoMiArgentina = onCall((req) => canjearIngreso(req.data?.codigo))

// ---------- Reinicio de la demo para todos los equipos ----------

const COLECCIONES = ['pacientes', 'cupos', 'derivaciones', 'controles', 'encuentros', 'problemas', 'medicacion', 'accesos', 'grillas']

export const reiniciarDemo = onCall({ timeoutSeconds: 300 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Hace falta iniciar sesión.')
  if (req.auth.token.rol === 'paciente') throw new HttpsError('permission-denied', 'Sólo los equipos de salud pueden reiniciar la demo.')
  const generacion = Number(req.data?.generacion)
  if (!Number.isInteger(generacion) || generacion < 1) throw new HttpsError('invalid-argument', 'Generación inválida.')
  const fs = getFirestore()
  for (const c of COLECCIONES) await fs.recursiveDelete(fs.collection(c))
  // La generación la elige el equipo que reinicia, así no se borra a sí mismo al recibir el aviso.
  await fs.doc('sistema/red-caps').set({ generacion, reiniciadoEn: FieldValue.serverTimestamp() }, { merge: true })
  return { generacion }
})
