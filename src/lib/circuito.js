import { db, nuevoId } from './db.js'
import { hoyISO, sumarDias } from './fechas.js'
import { generarCupos } from './seed.js'

/**
 * Cada hospital de la red tiene su agenda de cupo protegido para CAPS. En el prototipo
 * se crea la grilla estándar la primera vez que se lo usa y se extiende a 45 días.
 */
export async function asegurarCupos(hospitalId) {
  const ultimo = await db.cupos.where('hospitalId').equals(hospitalId).reverse().sortBy('fecha')
  const hasta = sumarDias(hoyISO(), 45)
  const desdeDia = ultimo.length ? Math.max(1, Math.round((new Date(ultimo[0].fecha) - new Date(hoyISO())) / 86_400_000) + 1) : 1
  if (ultimo.length && ultimo[0].fecha >= hasta) return
  await db.cupos.bulkPut(generarCupos(hospitalId, desdeDia, 45).filter((c) => !ultimo.some((u) => u.id === c.id)))
}

// Circuito cerrado CAPS → hospital → CAPS.
// El turno se elige contra la grilla local de cupo protegido. Con conexión, el cupo se
// reserva en la nube con una transacción de Firestore (src/lib/nube.js): si otro equipo
// ya lo tomó, se prueba el siguiente. Sin conexión el turno queda provisorio y se
// confirma al volver la señal (ver confirmarTurnosProvisorios).

/** Reserva remota del cupo: devuelve true (reservado), false (ya lo tiene otro) o null (sin red). */
let reservaRemota = null
let liberacionRemota = null
export function fijarReservaRemota({ reservar, liberar }) {
  reservaRemota = reservar
  liberacionRemota = liberar
}

const ACTIVOS = ['pendiente_sync', 'sin_cupo', 'turno_asignado', 'confirmado']
const MAX_INTENTOS = 40

/** Cupos protegidos libres desde mañana (o después de `despuesDe`) para esa especialidad, en orden. */
async function cuposLibres(hospitalId, especialidad, despuesDe = null) {
  const manana = sumarDias(hoyISO(), 1)
  const desde = despuesDe && sumarDias(despuesDe, 1) > manana ? sumarDias(despuesDe, 1) : manana
  const cupos = await db.cupos.where('[hospitalId+especialidad]').equals([hospitalId, especialidad]).toArray()
  return cupos
    .filter((c) => !c.derivacionId && c.fecha >= desde)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
}

/** Asigna turno a una derivación. Devuelve la derivación actualizada. */
export async function asignarTurno(derivacionId, { despuesDe = null } = {}) {
  const previa = await db.derivaciones.get(derivacionId)
  if (previa?.hospitalId) await asegurarCupos(previa.hospitalId)
  const probados = new Set()
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const d = await db.derivaciones.get(derivacionId)
    if (!d || d.turnoId) return d
    const cupo = (await cuposLibres(d.hospitalId, d.especialidad, despuesDe ?? d.turnoDespuesDe)).find((c) => !probados.has(c.id))
    if (!cupo) {
      await db.derivaciones.update(d.id, { estado: 'sin_cupo', sincronizada: 1 })
      return { ...d, estado: 'sin_cupo', sincronizada: 1 }
    }
    probados.add(cupo.id)
    // La reserva en la nube va fuera de la transacción local (Dexie no admite esperar la red adentro).
    const reservado = reservaRemota ? await reservaRemota(cupo, d.id) : null
    if (reservado === false) continue // lo tomó otro equipo: la bajada de la nube actualiza la grilla local
    const r = await db.transaction('rw', db.cupos, db.derivaciones, async () => {
      const actual = await db.derivaciones.get(derivacionId)
      if (!actual || actual.turnoId) return actual
      const cambios = {
        estado: 'turno_asignado', sincronizada: 1, turnoId: cupo.id, turnoFecha: cupo.fecha, turnoHora: cupo.hora,
        asignadaEn: Date.now(), turnoDespuesDe: null, cupoReservado: reservado ? cupo.id : null,
      }
      await db.cupos.update(cupo.id, { derivacionId: actual.id })
      await db.derivaciones.update(actual.id, cambios)
      return { ...actual, ...cambios }
    })
    return r
  }
  return db.derivaciones.get(derivacionId)
}

/**
 * Al volver la conexión: los turnos dados sin señal se reservan en la nube. Si otro
 * equipo tomó ese cupo mientras tanto, se busca el siguiente y hay que volver a avisar.
 */
export async function confirmarTurnosProvisorios() {
  if (!reservaRemota) return 0
  const provisorios = (await db.derivaciones.where('estado').anyOf(ACTIVOS).toArray()).filter((d) => d.turnoId && d.cupoReservado !== d.turnoId)
  let reasignados = 0
  for (const d of provisorios) {
    const cupo = (await db.cupos.get(d.turnoId)) ?? { id: d.turnoId, hospitalId: d.hospitalId, especialidad: d.especialidad, fecha: d.turnoFecha, hora: d.turnoHora }
    const ok = await reservaRemota(cupo, d.id)
    if (ok === null) return reasignados // se cortó la red
    if (ok) {
      await db.derivaciones.update(d.id, { cupoReservado: d.turnoId })
      continue
    }
    await db.derivaciones.update(d.id, {
      estado: 'pendiente_sync', turnoId: null, turnoFecha: null, turnoHora: null, cupoReservado: null, turnoDespuesDe: null,
      aviso: { ...(d.aviso ?? {}), enviado: false, respuesta: null },
    })
    await asignarTurno(d.id)
    reasignados++
  }
  return reasignados
}

/** Crea la derivación. Si hay conexión, asigna el turno en el momento. */
export async function crearDerivacion(datos, enLinea) {
  const id = nuevoId()
  await db.derivaciones.add({
    id,
    ...datos,
    estado: 'pendiente_sync',
    sincronizada: 0,
    creadaEn: Date.now(),
    asignadaEn: null,
    turnoId: null,
    turnoFecha: null,
    turnoHora: null,
    aviso: { canal: datos.canal, enviado: false, respuesta: null },
    contrarreferencia: null,
  })
  if (enLinea) await asignarTurno(id)
  return id
}

/** Procesa todo lo pendiente (derivaciones offline y las que esperaban cupo). */
export async function sincronizar() {
  const pendientes = await db.derivaciones.where('estado').anyOf('pendiente_sync', 'sin_cupo').sortBy('creadaEn')
  let asignadas = 0
  for (const d of pendientes) {
    const r = await asignarTurno(d.id)
    if (r?.turnoId) asignadas++
  }
  return { procesadas: pendientes.length, asignadas }
}

export async function contarPendientes() {
  return db.derivaciones.where('sincronizada').equals(0).count()
}

async function liberarCupo(d, liberados) {
  if (!d.turnoId) return
  await db.cupos.update(d.turnoId, { derivacionId: null })
  liberados.push([d.turnoId, d.id])
}

/** Respuesta del paciente al aviso multicanal. */
/** Respuesta del paciente: la registra el CAPS (`origen = 'caps'`) o la da el paciente desde la app. */
export async function registrarRespuesta(derivacionId, respuesta, origen = 'caps') {
  let fechaAnterior = null
  const liberados = []
  await db.transaction('rw', db.cupos, db.derivaciones, async () => {
    const d = await db.derivaciones.get(derivacionId)
    const aviso = { ...d.aviso, enviado: true, respuesta, respondioPor: origen, respondioEn: Date.now() }
    if (respuesta === 'confirmado') {
      await db.derivaciones.update(d.id, { aviso, estado: 'confirmado' })
    } else if (respuesta === 'reprogramar') {
      // El turno liberado vuelve al cupo y se busca el siguiente.
      fechaAnterior = d.turnoFecha
      await liberarCupo(d, liberados)
      await db.derivaciones.update(d.id, {
        aviso: { canal: d.aviso.canal, enviado: false, respuesta: null, reprogramaciones: (d.aviso.reprogramaciones ?? 0) + 1 },
        estado: 'pendiente_sync', sincronizada: 0, turnoId: null, turnoFecha: null, turnoHora: null, cupoReservado: null,
        // Si el turno lo asigna el servidor (paciente desde la app), busca desde el día siguiente.
        turnoDespuesDe: fechaAnterior,
      })
    } else if (respuesta === 'cancelado') {
      await liberarCupo(d, liberados)
      await db.derivaciones.update(d.id, { aviso, estado: 'cancelado', turnoId: null, cupoReservado: null })
    }
  })
  // El cupo liberado vuelve a quedar libre en la nube para los demás equipos.
  for (const [cupoId, derivId] of liberados) await liberacionRemota?.(cupoId, derivId)
  // El paciente pidió otro día: se busca desde el día siguiente al turno anterior.
  if (respuesta === 'reprogramar') await asignarTurno(derivacionId, { despuesDe: fechaAnterior })
}

export async function marcarAvisoEnviado(derivacionId) {
  const d = await db.derivaciones.get(derivacionId)
  await db.derivaciones.update(derivacionId, { aviso: { ...d.aviso, enviado: true, enviadoEn: Date.now() } })
}

export async function marcarAusente(derivacionId) {
  await db.derivaciones.update(derivacionId, { estado: 'ausente' })
}

export async function marcarAtendido(derivacionId) {
  await db.derivaciones.update(derivacionId, { estado: 'atendido' })
}

/**
 * Contrarreferencia de 3 campos. Cierra el circuito: agenda el próximo control en el CAPS.
 */
export async function registrarContrarreferencia(derivacionId, { diagnostico, codigo = null, indicacion, proximoControl, profesional }) {
  await db.transaction('rw', [db.derivaciones, db.controles, db.encuentros, db.problemas], async () => {
    const d = await db.derivaciones.get(derivacionId)
    await db.derivaciones.update(derivacionId, {
      estado: 'contrarreferido',
      contrarreferencia: { diagnostico, codigo, indicacion, proximoControl, profesional, fecha: Date.now() },
    })
    // La consulta del especialista queda en la Historia Clínica Única.
    await db.encuentros.add({
      id: nuevoId(), pacienteId: d.pacienteId, efectorId: d.hospitalId, fecha: hoyISO(), creadoEn: Date.now(),
      tipo: 'especialista', profesional: `${profesional} (${d.especialidad.toLowerCase()})`, fuente: 'red', derivacionId,
      motivo: d.motivo, diagnosticos: [{ codigo, texto: diagnostico }], evolucion: diagnostico, indicaciones: indicacion, signos: null,
    })
    if (codigo && !/^[RZ]/.test(codigo)) {
      const ya = await db.problemas.where('pacienteId').equals(d.pacienteId).filter((p) => p.estado === 'activo' && p.codigo === codigo).count()
      if (!ya) await db.problemas.add({ id: nuevoId(), pacienteId: d.pacienteId, codigo, texto: diagnostico, desde: hoyISO(), estado: 'activo' })
    }
    await db.controles.add({
      id: nuevoId(),
      pacienteId: d.pacienteId,
      capsId: d.capsId,
      fecha: proximoControl,
      motivo: `Control post ${d.especialidad.toLowerCase()}: ${indicacion}`,
      derivacionId,
      estado: 'agendado',
    })
  })
}

export async function registrarControlRealizado(controlId) {
  await db.transaction('rw', db.controles, db.pacientes, async () => {
    const c = await db.controles.get(controlId)
    await db.controles.update(controlId, { estado: 'realizado', realizadoEn: hoyISO() })
    await db.pacientes.update(c.pacienteId, { ultimoControl: hoyISO() })
  })
}

export async function registrarControlSinAgenda(pacienteId) {
  await db.pacientes.update(pacienteId, { ultimoControl: hoyISO() })
}
