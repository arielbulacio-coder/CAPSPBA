import Dexie from 'dexie'
import { cargarDatosDemo } from './seed.js'

// Base local (IndexedDB). Todo lo que se carga en un CAPS sin conexión queda acá
// y se sincroniza cuando vuelve la señal (ver sync.js).
export const db = new Dexie('red-caps')

db.version(1).stores({
  efectores: 'id, tipo',
  pacientes: 'id, dni, capsId',
  cupos: 'id, [hospitalId+especialidad], fecha, derivacionId',
  derivaciones: 'id, pacienteId, capsId, hospitalId, estado, sincronizada, creadaEn',
  controles: 'id, pacienteId, capsId, fecha, estado',
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
  papel: 'Comprobante en papel',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  llamada: 'Llamada con voz',
}

export const nuevoId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export async function inicializarDB() {
  const n = await db.efectores.count()
  if (n === 0) await cargarDatosDemo(db)
}

export async function reiniciarDemo() {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
  await cargarDatosDemo(db)
}
