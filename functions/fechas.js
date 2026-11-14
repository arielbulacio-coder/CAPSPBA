// Fechas 'YYYY-MM-DD' en horario de Argentina (el servidor corre en UTC).
const ZONA = 'America/Argentina/Buenos_Aires'

export function hoyAR(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

const aDate = (iso) => new Date(`${iso}T12:00:00Z`)

export function sumarDias(iso, dias) {
  const d = aDate(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export const diaSemana = (iso) => aDate(iso).getUTCDay()

/** Días hábiles (lun–vie) entre hoy+desde y hoy+hasta, ambos inclusive. */
export function diasHabiles(hoy, desde, hasta) {
  const out = []
  for (let i = desde; i <= hasta; i++) {
    const iso = sumarDias(hoy, i)
    const dow = diaSemana(iso)
    if (dow !== 0 && dow !== 6) out.push(iso)
  }
  return out
}
