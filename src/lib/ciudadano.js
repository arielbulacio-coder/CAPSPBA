import { db, nuevoId } from './db.js'
import { desdeISO, difDias, fechaLarga, hoyISO } from './fechas.js'
import { validarDNI } from './pacientes.js'

// Camino del ciudadano: canales para el paciente (turnos, app, recordatorios)
// conectados al MISMO circuito de derivación, para no repetir la app de 2021
// que agregó una pantalla sin cambiar el proceso.

/**
 * Ingreso del paciente con DNI + fecha de nacimiento.
 * PROTOTIPO: en producción la identidad se valida con Mi Argentina / RENAPER.
 */
export async function ingresarPaciente(dniTexto, fechaNac) {
  const dni = validarDNI(dniTexto)
  if (!dni.ok) return { error: dni.error }
  if (!fechaNac) return { error: 'Ingresá tu fecha de nacimiento.' }
  const p = await db.pacientes.where('dni').equals(dni.dni).first()
  if (!p || p.fechaNac !== fechaNac) {
    return { error: 'No encontramos a una persona con ese DNI y fecha de nacimiento. Si te atendés en un CAPS, pedí que te registren.' }
  }
  return { paciente: p }
}

/** Estado de la derivación explicado para el paciente. */
export function estadoParaPaciente(d) {
  switch (d.estado) {
    case 'pendiente_sync':
    case 'sin_cupo':
      return { titulo: 'Estamos buscando tu turno', detalle: 'Te avisamos apenas esté asignado.', tono: 'alerta' }
    case 'turno_asignado':
      return { titulo: 'Tenés turno', detalle: 'Confirmá si vas a ir, así nadie pierde el lugar.', tono: 'info' }
    case 'confirmado':
      return { titulo: 'Turno confirmado', detalle: 'Llevá tu DNI y los estudios que tengas.', tono: 'ok' }
    case 'atendido':
    case 'contrarreferido':
      return { titulo: 'Ya te atendieron', detalle: 'Tu CAPS recibió las indicaciones del especialista.', tono: 'ok' }
    case 'ausente':
      return { titulo: 'No asististe al turno', detalle: 'Acercate a tu CAPS para volver a pedirlo.', tono: 'error' }
    case 'cancelado':
      return { titulo: 'Turno cancelado', detalle: 'Si lo necesitás de nuevo, consultá en tu CAPS.', tono: 'gris' }
    default:
      return { titulo: d.estado, detalle: '', tono: 'gris' }
  }
}

/** El paciente pide un control en su CAPS: llega como solicitud al equipo del CAPS. */
export async function solicitarControl(paciente, { motivo, preferencia }) {
  await db.controles.add({
    id: nuevoId(),
    pacienteId: paciente.id,
    capsId: paciente.capsId,
    fecha: null,
    motivo: motivo.trim() || 'Control',
    preferencia,
    origen: 'paciente',
    estado: 'solicitado',
    solicitadoEn: Date.now(),
  })
}

/** El CAPS agenda una solicitud hecha por el paciente. */
export async function agendarSolicitud(controlId, fecha) {
  await db.controles.update(controlId, { fecha, estado: 'agendado' })
}

export async function cambiarCanal(pacienteId, canal, telefono) {
  await db.pacientes.update(pacienteId, { canal, telefono })
}

// ---------- Recordatorios ----------

const pad = (n) => String(n).padStart(2, '0')
const icsFecha = (iso, hora) => `${iso.replace(/-/g, '')}T${hora.replace(':', '')}00`
const icsTexto = (t) => String(t).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')

/** Archivo de calendario (.ics) con alarma el día anterior y 2 horas antes. */
export function archivoCalendario({ id, titulo, fecha, hora, lugar, descripcion }) {
  const ahora = new Date()
  const stamp = `${ahora.getUTCFullYear()}${pad(ahora.getUTCMonth() + 1)}${pad(ahora.getUTCDate())}T${pad(ahora.getUTCHours())}${pad(ahora.getUTCMinutes())}00Z`
  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Red CAPS PBA//ES', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${id}@red-caps`, `DTSTAMP:${stamp}`,
    `DTSTART:${icsFecha(fecha, hora || '08:00')}`, 'DURATION:PT30M',
    `SUMMARY:${icsTexto(titulo)}`, `LOCATION:${icsTexto(lugar)}`, `DESCRIPTION:${icsTexto(descripcion)}`,
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${icsTexto(`Mañana: ${titulo}`)}`, 'END:VALARM',
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${icsTexto(`En 2 horas: ${titulo}`)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ]
  return new Blob([lineas.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const permisoNotificaciones = () => ('Notification' in window ? Notification.permission : 'no-soportado')

export async function activarNotificaciones() {
  if (!('Notification' in window)) return 'no-soportado'
  return Notification.requestPermission()
}

/**
 * Muestra una notificación por cada turno de las próximas 48 h (una sola vez por turno).
 * Sin servidor de notificaciones push, el aviso aparece al abrir la app; el archivo de
 * calendario cubre el recordatorio aunque la app esté cerrada.
 */
export async function avisarTurnosProximos(turnos, hospitales) {
  if (permisoNotificaciones() !== 'granted') return 0
  const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null)
  let n = 0
  for (const t of turnos) {
    const faltan = difDias(hoyISO(), t.turnoFecha)
    if (faltan < 0 || faltan > 2) continue
    const clave = `aviso-${t.id}-${t.turnoFecha}`
    try {
      if (localStorage.getItem(clave)) continue
      localStorage.setItem(clave, '1')
    } catch {
      /* sin almacenamiento: puede repetirse */
    }
    const cuando = faltan === 0 ? 'Hoy' : faltan === 1 ? 'Mañana' : fechaLarga(t.turnoFecha)
    const titulo = `${cuando} tenés turno de ${t.especialidad}`
    const opciones = { body: `${t.turnoHora} h · ${hospitales[t.hospitalId]?.nombre ?? ''}`, tag: clave, icon: `${import.meta.env.BASE_URL}pwa-192x192.png` }
    if (reg?.showNotification) await reg.showNotification(titulo, opciones)
    else new Notification(titulo, opciones)
    n++
  }
  return n
}

export const diasHasta = (iso) => Math.round(difDias(hoyISO(), iso))
export const esFuturo = (iso) => iso && desdeISO(iso) >= desdeISO(hoyISO())
