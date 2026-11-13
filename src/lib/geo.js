import { useCallback, useState } from 'react'

/** Distancia en km entre dos puntos {lat, lon} (fórmula de haversine). */
export function distanciaKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null
  const r = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Devuelve la lista con `distancia` (km) respecto de `origen`, ordenada de menor a mayor. */
export function masCercanos(lista, origen, n = Infinity) {
  if (!origen) return lista.slice(0, n)
  return lista
    .map((x) => ({ ...x, distancia: distanciaKm(origen, x) }))
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, n)
}

export function formatoDistancia(km) {
  if (km == null) return ''
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toLocaleString('es-AR', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`
}

export const enlaceComoLlegar = (e) => `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lon}`

const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Búsqueda por nombre o partido, tolerante a tildes; todas las palabras deben aparecer. */
export function filtrarPorTexto(lista, texto) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean)
  if (!palabras.length) return lista
  return lista.filter((x) => {
    const t = normalizar(`${x.nombre} ${x.partido} ${x.calle ?? ''}`)
    return palabras.every((p) => t.includes(p))
  })
}

const MENSAJES_ERROR = {
  1: 'No diste permiso para usar tu ubicación. Podés buscar por nombre o partido.',
  2: 'No se pudo obtener la ubicación. Probá de nuevo o buscá por nombre o partido.',
  3: 'La ubicación tardó demasiado. Probá de nuevo o buscá por nombre o partido.',
}

/** Ubicación del dispositivo bajo demanda (sólo se pide cuando la persona toca el botón). */
export function useUbicacion() {
  const [estado, setEstado] = useState({ cargando: false, coords: null, error: null })
  const pedir = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setEstado({ cargando: false, coords: null, error: 'Este dispositivo no permite obtener la ubicación.' })
      return
    }
    setEstado((s) => ({ ...s, cargando: true, error: null }))
    navigator.geolocation.getCurrentPosition(
      (p) => setEstado({ cargando: false, coords: { lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy }, error: null }),
      (e) => setEstado({ cargando: false, coords: null, error: MENSAJES_ERROR[e.code] ?? MENSAJES_ERROR[2] }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60_000 },
    )
  }, [])
  return { ...estado, pedir }
}
