import Dexie from 'dexie'
import { cargarDatosDemo } from './seed.js'

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
  await cargarDatosDemo(db)
}
