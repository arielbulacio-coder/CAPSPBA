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
// En este prototipo el "servidor" es la misma base local: sincronizar = asignar
// turno contra el cupo protegido a las derivaciones cargadas sin conexión.

/** Primer cupo protegido libre desde mañana (o después de `despuesDe`) para esa especialidad. */
async function primerCupoLibre(hospitalId, especialidad, despuesDe = null) {
  const manana = sumarDias(hoyISO(), 1)
  const desde = despuesDe && sumarDias(despuesDe, 1) > manana ? sumarDias(despuesDe, 1) : manana
  const cupos = await db.cupos.where('[hospitalId+especialidad]').equals([hospitalId, especialidad]).toArray()
  return cupos
    .filter((c) => !c.derivacionId && c.fecha >= desde)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))[0]
}


/** Asigna turno a una derivación. Devuelve la derivación actualizada. */
export async function asignarTurno(derivacionId, { despuesDe = null } = {}) {
  const previa = await db.derivaciones.get(derivacionId)
  if (previa?.hospitalId) await asegurarCupos(previa.hospitalId)
  return db.transaction('rw', db.cupos, db.derivaciones, async () => {
    const d = await db.derivaciones.get(derivacionId)
    if (!d || d.turnoId) return d
    const cupo = await primerCupoLibre(d.hospitalId, d.especialidad, despuesDe)
    const cambios = cupo
      ? { estado: 'turno_asignado', sincronizada: 1, turnoId: cupo.id, turnoFecha: cupo.fecha, turnoHora: cupo.hora, asignadaEn: Date.now(), turnoDespuesDe: null }
      : { estado: 'sin_cupo', sincronizada: 1 }
    if (cupo) await db.cupos.update(cupo.id, { derivacionId: d.id })
    await db.derivaciones.update(d.id, cambios)
    return { ...d, ...cambios }
  })
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

async function liberarCupo(d) {
  if (d.turnoId) await db.cupos.update(d.turnoId, { derivacionId: null })
}

/** Respuesta del paciente al aviso multicanal. */
/** Respuesta del paciente: la registra el CAPS (`origen = 'caps'`) o la da el paciente desde la app. */
export async function registrarRespuesta(derivacionId, respuesta, origen = 'caps') {
  let fechaAnterior = null
  await db.transaction('rw', db.cupos, db.derivaciones, async () => {
    const d = await db.derivaciones.get(derivacionId)
    const aviso = { ...d.aviso, enviado: true, respuesta, respondioPor: origen, respondioEn: Date.now() }
    if (respuesta === 'confirmado') {
      await db.derivaciones.update(d.id, { aviso, estado: 'confirmado' })
    } else if (respuesta === 'reprogramar') {
      // El turno liberado vuelve al cupo y se busca el siguiente.
      fechaAnterior = d.turnoFecha
      await liberarCupo(d)
      await db.derivaciones.update(d.id, {
        aviso: { canal: d.aviso.canal, enviado: false, respuesta: null, reprogramaciones: (d.aviso.reprogramaciones ?? 0) + 1 },
        estado: 'pendiente_sync', sincronizada: 0, turnoId: null, turnoFecha: null, turnoHora: null,
        // Si el turno lo asigna el servidor (paciente desde la app), busca desde el día siguiente.
        turnoDespuesDe: fechaAnterior,
      })
    } else if (respuesta === 'cancelado') {
      await liberarCupo(d)
      await db.derivaciones.update(d.id, { aviso, estado: 'cancelado', turnoId: null })
    }
  })
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
