// Backend común en Firebase (Firestore + Authentication).
//
// La base local (Dexie / IndexedDB) sigue siendo la fuente de la interfaz, así la
// app funciona igual sin conexión. Este módulo la sincroniza con Firestore:
//  - Subida: cada cambio local queda con `_sync = 0` (ver db.js) y se sube en lotes
//    cuando hay conexión. Cada documento lleva `_srv` (hora del servidor).
//  - Bajada: un listener por colección trae lo que cambió después del último `_srv`
//    recibido, así cada equipo ve lo que cargan los demás casi en tiempo real.
//  - Conflictos: gana el último cambio (`_mod`). Un cambio local todavía no subido
//    no se pisa con una versión más vieja de la nube.
//  - Reinicio de la demo: `sistema/red-caps.generacion` cambia y todos los equipos
//    vacían sus tablas compartidas y vuelven a bajar la nube.
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import {
  collection, disableNetwork, doc, enableNetwork, getDoc, getDocs, initializeFirestore, limit,
  memoryLocalCache, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, where, writeBatch,
} from 'firebase/firestore'
import { alCambiarLocal, aplicarRemoto, db, TABLAS_NUBE } from './db.js'
import { firebaseConfig } from './firebaseConfig.js'

const LOTE = 400 // Firestore admite hasta 500 escrituras por lote.

let app, auth, fs, sistemaRef
let conectado = false
let arrancado = false
let arrancando = null
let generacion = null
let bajas = []
let bajaSistema = null
let subiendo = false
let otraSubida = false
let temporizador = null

// ---------- Estado visible en la interfaz ----------

let estado = { fase: 'iniciando', error: null, ultimaSync: null }
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

// ---------- Inicio y conexión ----------

export function iniciarNube({ enLinea }) {
  if (app) return
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  // Sin caché persistente de Firestore: la persistencia ya la da Dexie.
  fs = initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: memoryLocalCache() })
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

    const snap = await getDoc(sistemaRef)
    const local = (await db.meta.get('nube'))?.generacion ?? null
    if (!snap.exists()) {
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

    bajaSistema = onSnapshot(sistemaRef, (s) => {
      const g = s.data()?.generacion
      if (g != null && g !== generacion) {
        generacion = g
        reiniciarDesdeNube().catch(fallo)
      }
    }, fallo)
    await escucharTablas()
    arrancado = true
    fijar({ fase: conectado ? 'activa' : 'sin-conexion', error: null, ultimaSync: Date.now() })
  })().finally(() => {
    arrancando = null
  })
  return arrancando
}

// ---------- Bajada (nube → equipo) ----------

async function escucharTablas() {
  dejarDeEscuchar()
  for (const tabla of TABLAS_NUBE) {
    const desde = (await db.meta.get(`nube:${tabla}`))?.desde ?? 0
    const q = query(collection(fs, tabla), where('_srv', '>', Timestamp.fromMillis(desde)), orderBy('_srv'))
    let cola = Promise.resolve()
    const baja = onSnapshot(q, (snap) => {
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

async function aplicarTanda(tabla, snap) {
  const cambios = snap.docChanges().filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites)
  if (!cambios.length) return
  const remotos = cambios.map((c) => {
    const d = c.doc.data()
    return { ...d, id: d.id ?? c.doc.id, _srv: d._srv?.toMillis?.() ?? 0, _sync: 1 }
  })
  const locales = await db.table(tabla).bulkGet(remotos.map((r) => r.id))
  const aplicar = remotos.filter((r, i) => {
    const l = locales[i]
    return !(l && l._sync === 0 && (l._mod ?? 0) > (r._mod ?? 0))
  })
  if (aplicar.length) await aplicarRemoto(tabla, aplicar)
  const desde = Math.max(...remotos.map((r) => r._srv))
  const previo = (await db.meta.get(`nube:${tabla}`))?.desde ?? 0
  if (desde > previo) await db.meta.put({ clave: `nube:${tabla}`, desde })
  fijar({ ultimaSync: Date.now() })
}

// ---------- Subida (equipo → nube) ----------

function programarSubida(ms = 800) {
  clearTimeout(temporizador)
  temporizador = setTimeout(() => subir().catch(fallo), ms)
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
    for (const nombre of TABLAS_NUBE) {
      const tabla = db.table(nombre)
      const filas = todo ? await tabla.toArray() : await tabla.where('_sync').equals(0).toArray()
      for (let i = 0; i < filas.length; i += LOTE) {
        const parte = filas.slice(i, i + LOTE)
        const lote = writeBatch(fs)
        for (const f of parte) {
          const { _sync, _srv, ...datos } = f // eslint-disable-line no-unused-vars
          lote.set(doc(fs, nombre, String(f.id)), { ...datos, _mod: datos._mod ?? 0, _srv: serverTimestamp() })
        }
        await lote.commit()
        // Se marca como subido sólo si no cambió de nuevo mientras se subía.
        await db.transaction('rw', tabla, async () => {
          const actuales = await tabla.bulkGet(parte.map((f) => f.id))
          const listos = actuales.filter((a, j) => a && a._sync === 0 && a._mod === parte[j]._mod)
          if (listos.length) await tabla.bulkUpdate(listos.map((a) => ({ key: a.id, changes: { _sync: 1 } })))
        })
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

// ---------- Reinicios ----------

async function vaciarTablasCompartidas() {
  await db.transaction('rw', [...TABLAS_NUBE.map((t) => db.table(t)), db.meta], async () => {
    for (const t of TABLAS_NUBE) {
      await db.table(t).clear()
      await db.meta.delete(`nube:${t}`)
    }
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
 * Reinicia la demo para TODOS los equipos: borra las colecciones compartidas,
 * sube los datos de demostración de este equipo y avisa a los demás.
 */
export async function reiniciarNube() {
  if (!conectado) throw new Error('Hace falta conexión para reiniciar los datos de la nube.')
  await arrancar()
  dejarDeEscuchar()
  for (const nombre of TABLAS_NUBE) {
    for (;;) {
      const docs = await getDocs(query(collection(fs, nombre), limit(LOTE)))
      if (docs.empty) break
      const lote = writeBatch(fs)
      docs.forEach((d) => lote.delete(d.ref))
      await lote.commit()
    }
  }
  await subir({ todo: true })
  generacion = (generacion ?? 0) + 1
  await db.meta.put({ clave: 'nube', generacion })
  await setDoc(sistemaRef, { generacion, reiniciadoEn: serverTimestamp() }, { merge: true })
  await escucharTablas()
}

export const nubeActiva = () => arrancado && conectado
