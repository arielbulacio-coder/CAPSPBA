import { distanciaKm } from './geo.js'

// Cálculo de recorridos con el servicio OSRM de OpenStreetMap (FOSSGIS).
// Se envían sólo las coordenadas de origen y destino, sin datos personales.
const PERFILES = { pie: 'routed-foot', auto: 'routed-car' }

export async function calcularRuta(origen, destino, modo = 'pie') {
  const url =
    `https://routing.openstreetmap.de/${PERFILES[modo]}/route/v1/driving/` +
    `${origen.lon},${origen.lat};${destino.lon},${destino.lat}?overview=full&geometries=geojson&steps=true`
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!r.ok) throw new Error(`El servicio de rutas respondió ${r.status}`)
  const j = await r.json()
  if (j.code !== 'Ok' || !j.routes?.length) throw new Error('No se encontró un recorrido.')
  const ruta = j.routes[0]
  return {
    distancia: ruta.distance, // metros
    duracion: ruta.duration, // segundos
    linea: ruta.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    pasos: ruta.legs[0].steps.map((s) => ({
      texto: instruccion(s),
      distancia: s.distance,
      lat: s.maneuver.location[1],
      lon: s.maneuver.location[0],
      tipo: s.maneuver.type,
      modificador: s.maneuver.modifier ?? null,
    })),
  }
}

const GIROS = {
  left: 'girá a la izquierda',
  right: 'girá a la derecha',
  'slight left': 'doblá levemente a la izquierda',
  'slight right': 'doblá levemente a la derecha',
  'sharp left': 'girá cerrado a la izquierda',
  'sharp right': 'girá cerrado a la derecha',
  straight: 'seguí derecho',
  uturn: 'pegá la vuelta',
}

const RUMBOS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste']
export const rumbo = (grados) => RUMBOS[Math.round(((grados % 360) + 360) % 360 / 45) % 8]

function instruccion(s) {
  const { type, modifier, bearing_after: b, exit } = s.maneuver
  const calle = s.name ? ` por ${s.name}` : ''
  const giro = GIROS[modifier] ?? 'seguí'
  switch (type) {
    case 'depart':
      return `Salí hacia el ${rumbo(b)}${calle}`
    case 'arrive':
      return 'Llegaste a destino'
    case 'roundabout':
    case 'rotary':
      return `En la rotonda, tomá la ${exit ? `${exit}ª ` : ''}salida${calle}`
    case 'exit roundabout':
    case 'exit rotary':
      return `Salí de la rotonda${calle}`
    case 'continue':
    case 'new name':
      return modifier === 'straight' || !modifier ? `Seguí derecho${calle}` : `${cap(giro)}${calle}`
    case 'merge':
      return `Incorporate${calle}`
    case 'fork':
      return `En la bifurcación, ${modifier?.includes('left') ? 'mantenete a la izquierda' : 'mantenete a la derecha'}${calle}`
    case 'end of road':
      return `Al final de la calle, ${giro}${calle}`
    default:
      return `${cap(giro)}${calle}`
  }
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1)

export function formatoMetros(m) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`
  return `${(m / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`
}

export function formatoDuracion(seg) {
  const min = Math.max(1, Math.round(seg / 60))
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

/** Distancia (m) desde un punto a la polilínea de la ruta (aprox. a los vértices y segmentos). */
export function distanciaARuta(p, linea) {
  let min = Infinity
  for (let i = 0; i < linea.length - 1; i++) {
    min = Math.min(min, distanciaASegmento(p, linea[i], linea[i + 1]))
  }
  return min
}

function distanciaASegmento(p, [la1, lo1], [la2, lo2]) {
  // Proyección equirectangular local: suficiente para distancias cortas.
  const k = Math.cos((p.lat * Math.PI) / 180)
  const ax = (lo1 - p.lon) * k, ay = la1 - p.lat
  const bx = (lo2 - p.lon) * k, by = la2 - p.lat
  const dx = bx - ax, dy = by - ay
  const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0
  const x = ax + t * dx, y = ay + t * dy
  return Math.sqrt(x * x + y * y) * 111_320
}

/**
 * Próxima maniobra. Avanza (nunca retrocede) cuando la persona llega a menos de
 * 25 m del punto de maniobra actual. Devuelve el índice y la distancia a ese punto.
 */
export function pasoSiguiente(pasos, posicion, indiceActual = 1) {
  let i = Math.max(1, Math.min(indiceActual, pasos.length - 1))
  while (i < pasos.length - 1 && distanciaKm(posicion, pasos[i]) * 1000 < 25) i++
  return { indice: i, distancia: distanciaKm(posicion, pasos[i]) * 1000 }
}

/** Rumbo en grados desde a hacia b (para el modo sin conexión). */
export function rumboEntre(a, b) {
  const r = Math.PI / 180
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r)
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r)
  return ((Math.atan2(y, x) / r) + 360) % 360
}
