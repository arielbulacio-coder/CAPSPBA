// Backend común en Firebase (Firestore + Authentication + Cloud Functions).
//
// La base local (Dexie / IndexedDB) sigue siendo la fuente de la interfaz, así la
// app funciona igual sin conexión. Este módulo la sincroniza con Firestore:
//  - Subida: cada cambio local queda con `_sync = 0` (ver db.js) y se sube en lotes
//    cuando hay conexión. Cada documento lleva `_srv` (hora del servidor).
//  - Bajada: un listener por colección trae lo que cambió después del último `_srv`
//    recibido, así cada equipo ve lo que cargan los demás casi en tiempo real.
//  - Conflictos: gana el último cambio (`_mod`). Un cambio local todavía no subido
//    no se pisa con una versión más vieja de la nube.
//  - Cupos: los asigna el servidor (functions/turnos.js). El equipo asigna un turno
//    provisorio sin conexión, pero nunca sube `cupos`: la versión de la nube manda.
//  - Sesión: los equipos de salud usan sesión anónima y ven toda la red; el paciente
//    que ingresa con Mi Argentina recibe un token con rol "paciente" y sólo baja lo suyo.
//  - Reinicio de la demo: `sistema/red-caps.generacion` cambia y todos los equipos
//    vacían sus tablas compartidas y vuelven a bajar la nube.
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, signInWithCustomToken, signOut } from 'firebase/auth'
import {
  collection, disableNetwork, doc, enableNetwork, getDoc, initializeFirestore, memoryLocalCache,
  onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, where, writeBatch,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { alCambiarLocal, aplicarRemoto, db, TABLAS_NUBE } from './db.js'
import { firebaseConfig, REGION } from './firebaseConfig.js'

const LOTE = 400 // Firestore admite hasta 500 escrituras por lote.
/** Sólo el servidor escribe los cupos. */
const SOLO_BAJADA = ['cupos']
/** Lo que puede subir un paciente (las reglas de Firestore limitan qué campos). */
const SUBIDA_PACIENTE = ['pacientes', 'derivaciones', 'controles']

let app, auth, fs, funciones, sistemaRef
let conectado = false
let arrancado = false
let arrancando = null
let generacion = null
let alcance = { rol: 'equipo', pacienteId: null }
let bajas = []
let bajaSistema = null
let subiendo = false
let otraSubida = false
let temporizador = null

// ---------- Estado visible en la interfaz ----------

let estado = { fase: 'iniciando', error: null, ultimaSync: null, rol: 'equipo' }
const oyentes = new Set()
export function suscribirEstado(fn) {
  oyentes.add(fn)
  fn(estado)
  return () => oyentes.delete(fn)
}
function fijar(cambios) {
  estado = { ...estado, ...cambios }
  oyentes.forEach((fn) => fn(estado))
}
function fallo(e) {
  console.error('[nube]', e)
  const sinPermiso = e?.code === 'permission-denied' || e?.code === 'auth/operation-not-allowed' || e?.code === 'auth/admin-restricted-operation'
  fijar({
    fase: 'error',
    error: sinPermiso
      ? 'Firebase rechazó el acceso: revisar que esté activado el ingreso anónimo y publicadas las reglas de Firestore.'
      : e?.message ?? String(e),
  })
}

const esPaciente = () => alcance.rol === 'paciente'
const claveCursor = (tabla) => `nube:${esPaciente() ? `p-${alcance.pacienteId}` : 'red'}:${tabla}`

// ---------- Inicio y conexión ----------

export function iniciarNube({ enLinea }) {
  if (app) return
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  // Sin caché persistente de Firestore: la persistencia ya la da Dexie.
  fs = initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: memoryLocalCache() })
  funciones = getFunctions(app, REGION)
  sistemaRef = doc(fs, 'sistema', 'red-caps')
  import('firebase/analytics')
    .then(async ({ isSupported, getAnalytics }) => {
      if (await isSupported()) getAnalytics(app)
    })
    .catch(() => {})
  alCambiarLocal(() => programarSubida())
  fijarConexion(enLinea)
}

/** La app avisa si hay conexión (real o simulada con "Simular sin señal"). */
export function fijarConexion(enLinea) {
  conectado = enLinea
  if (!fs) return
  if (enLinea) {
    enableNetwork(fs)
      .then(() => arrancar())
      .then(() => programarSubida(0))
      .catch(fallo)
  } else {
    disableNetwork(fs).catch(() => {})
    fijar({ fase: 'sin-conexion' })
  }
}

function arrancar() {
  if (arrancado) {
    fijar({ fase: 'activa', error: null })
    return Promise.resolve()
  }
  arrancando ??= (async () => {
    fijar({ fase: 'conectando', error: null })
    await auth.authStateReady()
    if (!auth.currentUser) await signInAnonymously(auth)
    const { claims } = await auth.currentUser.getIdTokenResult()
    alcance = claims.rol === 'paciente' ? { rol: 'paciente', pacienteId: claims.pacienteId } : { rol: 'equipo', pacienteId: null }

    const snap = await getDoc(sistemaRef)
    const local = (await db.meta.get('nube'))?.generacion ?? null
    if (!snap.exists()) {
      if (esPaciente()) throw new Error('La red todavía no tiene datos.')
      // Primer equipo que se conecta: la nube arranca con lo que hay en este equipo.
      await subir({ todo: true })
      generacion = 1
      await db.meta.put({ clave: 'nube', generacion })
      await setDoc(sistemaRef, { generacion, creadoEn: serverTimestamp() })
    } else {
      generacion = snap.data().generacion ?? 1
      // Si la demo se reinició en otro equipo mientras éste no estaba conectado.
      if (local != null && local !== generacion) await vaciarTablasCompartidas()
      await db.meta.put({ clave: 'nube', generacion })
    }

    bajaSistema?.()
    bajaSistema = onSnapshot(sistemaRef, (s) => {
      const g = s.data()?.generacion
      if (g != null && g !== generacion) {
        generacion = g
        reiniciarDesdeNube().catch(fallo)
      }
    }, fallo)
    await escucharTablas()
    arrancado = true
    fijar({ fase: conectado ? 'activa' : 'sin-conexion', error: null, ultimaSync: Date.now(), rol: alcance.rol })
  })().finally(() => {
    arrancando = null
  })
  return arrancando
}

/** Cambió la sesión (paciente que entra o sale): se vuelve a arrancar con el nuevo alcance. */
async function reiniciarSesion() {
  dejarDeEscuchar()
  bajaSistema?.()
  bajaSistema = null
  arrancado = false
  if (conectado) await arrancar()
}

// ---------- Bajada (nube → equipo) ----------

function consultaDe(tabla, desde) {
  const filtros = [where('_srv', '>', Timestamp.fromMillis(desde)), orderBy('_srv')]
  // El paciente sólo puede leer lo suyo: la consulta tiene que decirlo (reglas de Firestore).
  if (esPaciente()) filtros.unshift(where(tabla === 'pacientes' ? 'id' : 'pacienteId', '==', alcance.pacienteId))
  return query(collection(fs, tabla), ...filtros)
}

async function escucharTablas() {
  dejarDeEscuchar()
  for (const tabla of TABLAS_NUBE) {
    if (esPaciente() && SOLO_BAJADA.includes(tabla)) continue
    const desde = (await db.meta.get(claveCursor(tabla)))?.desde ?? 0
    let cola = Promise.resolve()
    const baja = onSnapshot(consultaDe(tabla, desde), (snap) => {
      // Se procesa en orden para no mezclar dos tandas de la misma colección.
      cola = cola.then(() => aplicarTanda(tabla, snap)).catch(fallo)
    }, fallo)
    bajas.push(baja)
  }
}

function dejarDeEscuchar() {
  bajas.forEach((b) => b())
  bajas = []
}

const deFirestore = (id, d) => ({ ...d, id: d.id ?? id, _srv: d._srv?.toMillis?.() ?? 0, _sync: 1 })

async function aplicarTanda(tabla, snap) {
  const cambios = snap.docChanges().filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites)
  if (!cambios.length) return
  const remotos = cambios.map((c) => deFirestore(c.doc.id, c.doc.data()))
  const locales = await db.table(tabla).bulkGet(remotos.map((r) => r.id))
  // En los cupos manda siempre el servidor; en lo demás, el último cambio.
  const aplicar = SOLO_BAJADA.includes(tabla)
    ? remotos
    : remotos.filter((r, i) => {
        const l = locales[i]
        return !(l && l._sync === 0 && (l._mod ?? 0) > (r._mod ?? 0))
      })
  if (aplicar.length) await aplicarRemoto(tabla, aplicar)
  const desde = Math.max(...remotos.map((r) => r._srv))
  const clave = claveCursor(tabla)
  const previo = (await db.meta.get(clave))?.desde ?? 0
  if (desde > previo) await db.meta.put({ clave, desde })
  fijar({ ultimaSync: Date.now() })
}

// ---------- Subida (equipo → nube) ----------

function programarSubida(ms = 800) {
  clearTimeout(temporizador)
  temporizador = setTimeout(() => subir().catch(fallo), ms)
}

const paraFirestore = (f) => {
  const { _sync, _srv, ...datos } = f // eslint-disable-line no-unused-vars
  return { ...datos, _mod: datos._mod ?? 0, _srv: serverTimestamp() }
}

async function marcarSubidas(tabla, filas) {
  // Se marca como subido sólo si no cambió de nuevo mientras se subía.
  await db.transaction('rw', tabla, async () => {
    const actuales = await tabla.bulkGet(filas.map((f) => f.id))
    const listos = actuales.filter((a, j) => a && a._sync === 0 && a._mod === filas[j]._mod)
    if (listos.length) await tabla.bulkUpdate(listos.map((a) => ({ key: a.id, changes: { _sync: 1 } })))
  })
}

/**
 * Las reglas rechazaron el lote (por ejemplo, un paciente con una versión vieja de su
 * turno). Se prueba documento por documento; lo rechazado se descarta y se vuelve a
 * bajar la versión de la nube, para que la cola de subida no quede trabada.
 */
async function subirDeAUno(nombre, tabla, filas) {
  for (const f of filas) {
    const ref = doc(fs, nombre, String(f.id))
    try {
      await setDoc(ref, paraFirestore(f))
      await marcarSubidas(tabla, [f])
    } catch (e) {
      if (e?.code !== 'permission-denied') throw e
      console.warn(`[nube] cambio rechazado en ${nombre}/${f.id}; se usa la versión de la nube`)
      const remoto = await getDoc(ref).catch(() => null)
      if (remoto?.exists()) await aplicarRemoto(nombre, [deFirestore(remoto.id, remoto.data())])
      else await tabla.update(f.id, { _sync: 1 })
    }
  }
}

function tablasASubir() {
  const tablas = TABLAS_NUBE.filter((t) => !SOLO_BAJADA.includes(t))
  return esPaciente() ? tablas.filter((t) => SUBIDA_PACIENTE.includes(t)) : tablas
}

/** Sube los cambios locales pendientes (o todo, la primera vez). */
export async function subir({ todo = false } = {}) {
  if (!fs || !conectado || (!arrancado && !todo)) return
  // La subida completa (primer equipo o reinicio) no espera a la incremental: escribir
  // dos veces el mismo documento no cambia el resultado.
  if (!todo && subiendo) {
    otraSubida = true
    return
  }
  if (!todo) subiendo = true
  try {
    for (const nombre of tablasASubir()) {
      const tabla = db.table(nombre)
      let filas = todo ? await tabla.toArray() : await tabla.where('_sync').equals(0).toArray()
      // Un paciente sólo sube lo suyo; lo de otras personas queda para cuando entre un equipo.
      if (esPaciente()) filas = filas.filter((f) => (nombre === 'pacientes' ? f.id : f.pacienteId) === alcance.pacienteId)
      for (let i = 0; i < filas.length; i += LOTE) {
        const parte = filas.slice(i, i + LOTE)
        const lote = writeBatch(fs)
        for (const f of parte) lote.set(doc(fs, nombre, String(f.id)), paraFirestore(f))
        try {
          await lote.commit()
          await marcarSubidas(tabla, parte)
        } catch (e) {
          if (e?.code !== 'permission-denied') throw e
          await subirDeAUno(nombre, tabla, parte)
        }
      }
    }
    if (arrancado) fijar({ fase: 'activa', error: null, ultimaSync: Date.now() })
  } finally {
    if (!todo) subiendo = false
    if (!todo && otraSubida) {
      otraSubida = false
      programarSubida(0)
    }
  }
}

// ---------- Ingreso del paciente con Mi Argentina ----------

/** Canjea el código que devuelve functions/miargentina.js e inicia la sesión del paciente. */
export async function ingresarConMiArgentina(codigo) {
  if (!app) throw new Error('La red no está disponible.')
  const canjear = httpsCallable(funciones, 'canjearIngresoMiArgentina')
  const { data } = await canjear({ codigo })
  await signInWithCustomToken(auth, data.token)
  await reiniciarSesion()
  return data.paciente
}

/** El paciente sale: se cierra su sesión y el equipo vuelve a la sesión de la red. */
export async function salirPaciente() {
  if (!auth || !esPaciente()) return
  await signOut(auth)
  alcance = { rol: 'equipo', pacienteId: null }
  fijar({ rol: 'equipo' })
  await reiniciarSesion()
}

// ---------- Reinicios ----------

async function vaciarTablasCompartidas() {
  await db.transaction('rw', [...TABLAS_NUBE.map((t) => db.table(t)), db.meta], async () => {
    for (const t of TABLAS_NUBE) await db.table(t).clear()
    await db.meta.where('clave').startsWith('nube:').delete()
  })
}

/** Otro equipo reinició la demo: se vacía lo compartido y se vuelve a bajar todo. */
async function reiniciarDesdeNube() {
  dejarDeEscuchar()
  await vaciarTablasCompartidas()
  await db.meta.put({ clave: 'nube', generacion })
  await escucharTablas()
}

/** Después de reiniciar sólo este equipo: se vuelve a bajar lo que hay en la nube. */
export async function volverABajar() {
  if (!arrancado) return
  dejarDeEscuchar()
  await db.meta.put({ clave: 'nube', generacion })
  await escucharTablas()
}

/**
 * Reinicia la demo para TODOS los equipos: el servidor borra las colecciones
 * compartidas, este equipo sube sus datos de demostración y los demás se enteran
 * por el cambio de generación.
 */
export async function reiniciarNube() {
  if (!conectado) throw new Error('Hace falta conexión para reiniciar los datos de la nube.')
  await arrancar()
  if (esPaciente()) throw new Error('Sólo un equipo de salud puede reiniciar la demo.')
  dejarDeEscuchar()
  // La nueva generación se fija antes, para no vaciarse a sí mismo al recibir el aviso.
  generacion = (generacion ?? 0) + 1
  await db.meta.put({ clave: 'nube', generacion })
  await httpsCallable(funciones, 'reiniciarDemo', { timeout: 300_000 })({ generacion })
  await db.meta.where('clave').startsWith('nube:').delete()
  await subir({ todo: true })
  await escucharTablas()
}

export const nubeActiva = () => arrancado && conectado
