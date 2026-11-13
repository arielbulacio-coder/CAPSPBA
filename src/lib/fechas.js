// Utilidades de fechas en horario local. Las fechas de turno se guardan como 'YYYY-MM-DD'.

export function hoyISO() {
  return aISO(new Date())
}

export function aISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function desdeISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function sumarDias(iso, dias) {
  const d = desdeISO(iso)
  d.setDate(d.getDate() + dias)
  return aISO(d)
}

/** Días hábiles (lun–vie) entre hoy+desde y hoy+hasta, ambos inclusive. */
export function diasHabiles(desde, hasta) {
  const out = []
  for (let i = desde; i <= hasta; i++) {
    const iso = sumarDias(hoyISO(), i)
    const dow = desdeISO(iso).getDay()
    if (dow !== 0 && dow !== 6) out.push(iso)
  }
  return out
}

/** Diferencia en días (puede ser fraccional) entre dos timestamps o ISO. */
export function difDias(a, b) {
  const ta = typeof a === 'string' ? desdeISO(a).getTime() : a
  const tb = typeof b === 'string' ? desdeISO(b).getTime() : b
  return (tb - ta) / 86_400_000
}

const fmtFecha = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
const fmtFechaLarga = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
const fmtHora = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const fechaCorta = (iso) => (iso ? fmtFecha.format(desdeISO(iso)) : '—')
export const fechaLarga = (iso) => (iso ? fmtFechaLarga.format(desdeISO(iso)) : '—')
export const fechaHora = (ts) => (ts ? fmtHora.format(new Date(ts)) : '—')

export function edad(fechaNac) {
  if (!fechaNac) return null
  const n = desdeISO(fechaNac)
  const h = new Date()
  let e = h.getFullYear() - n.getFullYear()
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--
  return e
}
