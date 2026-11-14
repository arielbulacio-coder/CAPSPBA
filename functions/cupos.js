import { diaSemana, diasHabiles } from './fechas.js'

// Grilla estándar de cupo protegido. Debe coincidir con src/lib/seed.js (mismos IDs),
// porque los equipos arman la misma grilla en forma local mientras están sin conexión.
export const CUPOS_POR_DIA = { 'Cardiología': ['08:00', '08:30', '09:00', '09:30'], 'Endocrinología': ['10:00', '10:30'], 'Nefrología': ['11:00'], 'Oftalmología': ['12:00'] }
export const DIAS_ESPECIALIDAD = { 'Cardiología': [1, 2, 3, 4, 5], 'Endocrinología': [2, 4], 'Nefrología': [3], 'Oftalmología': [1, 5] }

export const idCupo = (hospitalId, especialidad, fecha, hora) => `${hospitalId}-${especialidad}-${fecha}-${hora}`

export function generarCupos(hospitalId, hoy, desde, hasta) {
  const cupos = []
  for (const fecha of diasHabiles(hoy, desde, hasta)) {
    const dow = diaSemana(fecha)
    for (const [especialidad, horas] of Object.entries(CUPOS_POR_DIA)) {
      if (!DIAS_ESPECIALIDAD[especialidad].includes(dow)) continue
      for (const hora of horas) cupos.push({ id: idCupo(hospitalId, especialidad, fecha, hora), hospitalId, especialidad, fecha, hora, derivacionId: null })
    }
  }
  return cupos
}
