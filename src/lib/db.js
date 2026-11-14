import Dexie from 'dexie'
import { cargarDatosDemo, cargarHCUDemo } from './seed.js'

// Base local (IndexedDB). Todo lo que se carga en un CAPS sin conexión queda acá
// y se sincroniza cuando vuelve la señal (ver circuito.js).
export const db = new Dexie('red-caps')

db.version(1).stores({
  efectores: 'id, tipo',
  pacientes: 'id, dni, capsId',
  cupos: 'id, [hospitalId+especialidad], fecha, derivacionId',
  derivaciones: 'id, pacienteId, capsId, hospitalId, estado, sincronizada, creadaEn',
  controles: 'id, pacienteId, capsId, fecha, estado',
})

// v2: red provincial (todos los hospitales y CAPS) y metadatos del padrón.
db.version(2).stores({
  efectores: 'id, tipo, partido',
  cupos: 'id, [hospitalId+especialidad], hospitalId, fecha, derivacionId',
  meta: 'clave',
})

// v3: Historia Clínica Única (encuentros, problemas, medicación) y registro de accesos.
db.version(3).stores({
  pacientes: 'id, dni, capsId, fusionadoCon',
  encuentros: 'id, pacienteId, efectorId, fecha, tipo',
  problemas: 'id, pacienteId, codigo, estado',
  medicacion: 'id, pacienteId, activa',
  accesos: '++id, pacienteId, fecha',
})

// v4/v5: backend común en Firebase (Firestore). Cada tabla compartida lleva `_sync`
// (0 = cambio local sin subir, 1 = igual que en la nube) y `_mod` (hora del último cambio).
// `accesos` pasa a tener ID de texto para que no choquen los de distintos equipos
// (Dexie no permite cambiar la clave primaria: se borra en v4 y se recrea en v5).
db.version(4)
  .stores({
    pacientes: 'id, dni, capsId, fusionadoCon, _sync',
    cupos: 'id, [hospitalId+especialidad], hospitalId, fecha, derivacionId, _sync',
    derivaciones: 'id, pacienteId, capsId, hospitalId, estado, sincronizada, creadaEn, _sync',
    controles: 'id, pacienteId, capsId, fecha, estado, _sync',
    encuentros: 'id, pacienteId, efectorId, fecha, tipo, _sync',
    problemas: 'id, pacienteId, codigo, estado, _sync',
    medicacion: 'id, pacienteId, activa, _sync',
    accesos: null,
  })
  .upgrade(async (tx) => {
    // Lo que ya había en el equipo se toma como base: si la nube está vacía se sube
    // entera la primera vez; si no, manda lo que está en la nube.
    for (const t of ['pacientes', 'cupos', 'derivaciones', 'controles', 'encuentros', 'problemas', 'medicacion']) {
      await tx.table(t).toCollection().modify((o) => {
        o._sync = 1
        o._mod = 0
      })
    }
  })
db.version(5).stores({ accesos: 'id, pacienteId, fecha, _sync' })

/** Tablas que se comparten entre equipos a través de Firestore (una colección por tabla). */
export const TABLAS_NUBE = ['pacientes', 'cupos', 'derivaciones', 'controles', 'encuentros', 'problemas', 'medicacion', 'accesos']

// Registro de cambios locales. Toda escritura en una tabla compartida queda marcada
// `_sync = 0` y se sube cuando hay conexión, salvo:
//  - lo que llega de la nube (claves en `aplicandoRemoto`),
//  - la confirmación de subida (`update({ _sync: 1 })`),
//  - los datos de demostración (`escribiendoBase`), que son iguales en todos los equipos.
const aplicandoRemoto = new Set()
let escribiendoBase = false
const oyentes = new Set()
export const alCambiarLocal = (fn) => {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}
const avisar = () => oyentes.forEach((fn) => fn())

for (const nombre of TABLAS_NUBE) {
  const tabla = db.table(nombre)
  tabla.hook('creating', function (clave, obj) {
    if (escribiendoBase || aplicandoRemoto.has(`${nombre}:${clave ?? obj.id}`) || obj._sync === 1) {
      obj._sync = 1
      obj._mod ??= 0
      return
    }
    obj._sync = 0
    obj._mod = Date.now()
    this.onsuccess = avisar
  })
  tabla.hook('updating', function (cambios, clave) {
    if (escribiendoBase || aplicandoRemoto.has(`${nombre}:${clave}`) || cambios._sync === 1) return undefined
    this.onsuccess = avisar
    return { _sync: 0, _mod: Date.now() }
  })
}

/** Guarda registros que vienen de la nube sin volver a marcarlos para subir. */
export async function aplicarRemoto(nombre, registros) {
  const claves = registros.map((r) => `${nombre}:${r.id}`)
  claves.forEach((c) => aplicandoRemoto.add(c))
  try {
    await db.table(nombre).bulkPut(registros)
  } finally {
    claves.forEach((c) => aplicandoRemoto.delete(c))
  }
}

async function comoBase(fn) {
  escribiendoBase = true
  try {
    return await fn()
  } finally {
    escribiendoBase = false
  }
}

export const ESTADOS = {
  pendiente_sync: { label: 'Pendiente de sincronizar', tono: 'gris' },
  sin_cupo: { label: 'En espera de cupo', tono: 'alerta' },
  turno_asignado: { label: 'Turno asignado', tono: 'info' },
  confirmado: { label: 'Confirmado', tono: 'ok' },
  atendido: { label: 'Atendido', tono: 'info' },
  contrarreferido: { label: 'Contrarreferencia recibida', tono: 'ok' },
  ausente: { label: 'Ausente', tono: 'error' },
  cancelado: { label: 'Cancelado', tono: 'gris' },
}

export const ESPECIALIDADES = ['Cardiología', 'Endocrinología', 'Nefrología', 'Oftalmología']

export const CANALES = {
  app: 'App Red CAPS',
  papel: 'Comprobante en papel',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  llamada: 'Llamada con voz',
}

export const nuevoId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** Padrón de establecimientos de la provincia (generado por scripts/establecimientos.mjs). */
async function descargarPadron() {
  const r = await fetch(`${import.meta.env.BASE_URL}data/establecimientos.json`)
  if (!r.ok) throw new Error(`No se pudo cargar el padrón de establecimientos (${r.status})`)
  const d = await r.json()
  const efectores = d.filas.map((f) => Object.fromEntries(d.campos.map((c, i) => [c, f[i]])))
  return { version: d.version, fuente: d.fuente, efectores }
}

/**
 * Carga el padrón la primera vez y los datos de demostración. Las bases creadas
 * con la versión piloto (un hospital ficticio) se reinician una vez.
 */
export async function inicializarDB() {
  const actual = await db.meta.get('padron')
  if (actual && (await db.efectores.count()) > 0) {
    // Si hay una versión nueva del padrón, se actualizan los establecimientos
    // sin tocar pacientes, derivaciones ni cupos (los IDs de OSM son estables).
    descargarPadron()
      .then(async (p) => {
        if (p.version === actual.version) return
        await db.transaction('rw', db.efectores, db.meta, async () => {
          await db.efectores.bulkPut(p.efectores)
          await db.meta.put({ clave: 'padron', version: p.version, fuente: p.fuente })
        })
      })
      .catch(() => {})
    // Bases creadas antes de la HCU: se agregan las historias de ejemplo una vez.
    if (!(await db.meta.get('hcu'))) await comoBase(() => cargarHCUDemo(db))
    return
  }
  await reiniciarDemo(await descargarPadron())
}

export async function reiniciarDemo(padron) {
  const p = padron ?? (await descargarPadron())
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
    await db.efectores.bulkAdd(p.efectores)
    await db.meta.put({ clave: 'padron', version: p.version, fuente: p.fuente })
  })
  // Los datos de demostración tienen IDs fijos: son la misma base en todos los equipos.
  await comoBase(async () => {
    await cargarDatosDemo(db)
    await cargarHCUDemo(db)
  })
}
