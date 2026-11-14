// Asignación de turnos con cupo protegido, del lado del servidor.
//
// Los equipos asignan el turno en forma local (también sin conexión) y suben la
// derivación. Este trigger es la autoridad: en una transacción verifica que el cupo
// sea de esa derivación; si otro equipo ya lo tomó, le busca el siguiente libre.
// Los clientes no pueden escribir en `cupos` (firestore.rules).
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { generarCupos } from './cupos.js'
import { hoyAR, sumarDias } from './fechas.js'

/** Estados en los que la derivación necesita (o tiene) un turno vigente. */
export const ACTIVOS = ['pendiente_sync', 'sin_cupo', 'turno_asignado', 'confirmado']
const DIAS_AGENDA = 45

/** Marca de cambio para que los equipos bajen el documento (ver src/lib/nube.js). */
const marca = () => ({ _mod: Date.now(), _srv: FieldValue.serverTimestamp() })

/** Crea la grilla de cupo protegido del hospital hasta hoy + 45 días (sin pisar cupos tomados). */
export async function asegurarGrilla(hospitalId) {
  const db = getFirestore()
  const hoy = hoyAR()
  const hasta = sumarDias(hoy, DIAS_AGENDA)
  const ref = db.doc(`grillas/${hospitalId}`)
  const grilla = await ref.get()
  if (grilla.exists && grilla.data().hasta >= hasta) return
  const escritor = db.bulkWriter()
  escritor.onWriteError((e) => e.code !== 6 /* ALREADY_EXISTS */ && e.failedAttempts < 3)
  for (const c of generarCupos(hospitalId, hoy, 1, DIAS_AGENDA)) {
    escritor.create(db.doc(`cupos/${c.id}`), { ...c, _mod: 0, _srv: FieldValue.serverTimestamp() })
  }
  await escritor.close()
  await ref.set({ hasta, actualizada: FieldValue.serverTimestamp() })
}

async function liberar(cupoId, derivacionId) {
  const db = getFirestore()
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`cupos/${cupoId}`)
    const c = await tx.get(ref)
    if (c.exists && c.data().derivacionId === derivacionId) tx.update(ref, { derivacionId: null, ...marca() })
  })
}

/** Procesa un cambio en `derivaciones/{id}`. */
export async function validarTurno(id, antes, despues) {
  if (antes?.turnoId && antes.turnoId !== despues?.turnoId) await liberar(antes.turnoId, id)
  if (!despues) return
  if (despues.estado === 'cancelado') {
    if (despues.turnoId) await liberar(despues.turnoId, id)
    return
  }
  if (despues.hospitalId && ACTIVOS.includes(despues.estado)) await asegurarGrilla(despues.hospitalId)

  const db = getFirestore()
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`derivaciones/${id}`)
    const snap = await tx.get(ref)
    if (!snap.exists) return
    const d = snap.data()
    const activa = ACTIVOS.includes(d.estado)

    if (d.turnoId) {
      const cRef = db.doc(`cupos/${d.turnoId}`)
      const c = await tx.get(cRef)
      if (!c.exists) {
        // Turno de un cupo que la nube todavía no tenía (datos históricos o grilla local).
        tx.set(cRef, {
          id: d.turnoId, hospitalId: d.hospitalId, especialidad: d.especialidad, fecha: d.turnoFecha, hora: d.turnoHora,
          derivacionId: id, ...marca(),
        })
        return
      }
      const duenio = c.data().derivacionId
      if (duenio === id) return
      if (!duenio) {
        tx.update(cRef, { derivacionId: id, ...marca() })
        return
      }
      // Otro equipo tomó el mismo cupo. Si la derivación ya se cerró, queda como está.
      if (!activa) return
      logger.info('Cupo tomado por otra derivación; se reasigna', { derivacion: id, cupo: d.turnoId, duenio })
    } else if (!activa) {
      return
    }

    const manana = sumarDias(hoyAR(), 1)
    const despuesDe = d.turnoDespuesDe ? sumarDias(d.turnoDespuesDe, 1) : null
    const desde = despuesDe && despuesDe > manana ? despuesDe : manana
    const libres = await tx.get(
      db.collection('cupos')
        .where('hospitalId', '==', d.hospitalId)
        .where('especialidad', '==', d.especialidad)
        .where('derivacionId', '==', null)
        .where('fecha', '>=', desde)
        .orderBy('fecha')
        .orderBy('hora')
        .limit(1),
    )
    const reasignada = Boolean(d.turnoId)
    if (libres.empty) {
      tx.update(ref, { estado: 'sin_cupo', sincronizada: 1, turnoId: null, turnoFecha: null, turnoHora: null, ...marca() })
      return
    }
    const cupo = libres.docs[0]
    const { fecha, hora } = cupo.data()
    tx.update(cupo.ref, { derivacionId: id, ...marca() })
    tx.update(ref, {
      estado: 'turno_asignado', sincronizada: 1, turnoId: cupo.id, turnoFecha: fecha, turnoHora: hora,
      asignadaEn: Date.now(), turnoDespuesDe: null,
      // El turno cambió: hay que volver a avisarle al paciente.
      aviso: { ...(d.aviso ?? {}), enviado: false, respuesta: null },
      ...(reasignada ? { turnoReasignado: true } : {}),
      ...marca(),
    })
  })
}
