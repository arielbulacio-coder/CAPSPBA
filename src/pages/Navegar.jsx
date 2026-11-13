import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { db } from '../lib/db.js'
import { distanciaKm } from '../lib/geo.js'
import { calcularRuta, distanciaARuta, formatoDuracion, formatoMetros, pasoSiguiente, rumbo, rumboEntre } from '../lib/rutas.js'

const ERRORES_GPS = {
  1: 'Para guiarte necesitamos permiso para usar tu ubicación.',
  2: 'No se pudo obtener tu ubicación. Revisá que el GPS esté activado.',
  3: 'La ubicación tardó demasiado. Seguimos intentando…',
}

/** Sigue la ubicación del dispositivo mientras la pantalla está abierta. */
function usePosicionEnVivo() {
  const [pos, setPos] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Este dispositivo no permite obtener la ubicación.')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy, rumbo: p.coords.heading })
        setError(null)
      },
      (e) => setError(ERRORES_GPS[e.code] ?? ERRORES_GPS[2]),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])
  return { pos, error }
}

/** Mantiene la pantalla encendida mientras se navega (si el navegador lo permite). */
function useMantenerPantalla(activo) {
  useEffect(() => {
    if (!activo || !('wakeLock' in navigator)) return
    let lock
    navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => lock?.release?.().catch(() => {})
  }, [activo])
}

function Encuadre({ ruta, pos, destino, navegando }) {
  const map = useMap()
  const encuadrado = useRef(false)
  useEffect(() => {
    if (navegando && pos) {
      map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 17), { animate: true })
      return
    }
    if (encuadrado.current && !ruta) return
    const puntos = ruta?.linea?.length ? ruta.linea : [pos && [pos.lat, pos.lon], [destino.lat, destino.lon]].filter(Boolean)
    if (puntos.length > 1) map.fitBounds(puntos, { padding: [40, 40], maxZoom: 17 })
    else map.setView(puntos[0], 16)
    encuadrado.current = true
  }, [ruta, navegando, pos?.lat, pos?.lon]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export default function Navegar() {
  const { id } = useParams()
  const navigate = useNavigate()
  const destino = useLiveQuery(() => db.efectores.get(id), [id])
  const { pos, error: errorGps } = usePosicionEnVivo()
  const [modo, setModo] = useState('pie')
  const [ruta, setRuta] = useState(null)
  const [estadoRuta, setEstadoRuta] = useState('esperando') // esperando | calculando | ok | sin_conexion | error
  const [navegando, setNavegando] = useState(false)
  const [indice, setIndice] = useState(1)
  const ultimoCalculo = useRef(0)
  useMantenerPantalla(navegando)

  const distanciaDirecta = pos && destino ? distanciaKm(pos, destino) * 1000 : null
  const llegaste = distanciaDirecta != null && distanciaDirecta < 30

  async function recalcular(origen) {
    if (!origen || !destino) return
    if (!navigator.onLine) {
      setEstadoRuta('sin_conexion')
      return
    }
    ultimoCalculo.current = Date.now()
    setEstadoRuta('calculando')
    try {
      const r = await calcularRuta(origen, destino, modo)
      setRuta(r)
      setIndice(1)
      setEstadoRuta('ok')
    } catch {
      setEstadoRuta(navigator.onLine ? 'error' : 'sin_conexion')
    }
  }

  // Primer cálculo y cada vez que cambia el modo.
  const tienePos = !!pos
  useEffect(() => {
    if (tienePos && destino) recalcular(pos)
  }, [tienePos, destino?.id, modo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Durante la navegación: avanzar pasos y recalcular si la persona se desvía.
  useEffect(() => {
    if (!navegando || !pos || !ruta) return
    const { indice: i } = pasoSiguiente(ruta.pasos, pos, indice)
    if (i !== indice) setIndice(i)
    const desvio = distanciaARuta(pos, ruta.linea)
    if (desvio > 50 && Date.now() - ultimoCalculo.current > 15_000) recalcular(pos)
  }, [pos?.lat, pos?.lon, navegando]) // eslint-disable-line react-hooks/exhaustive-deps

  const proximo = useMemo(() => {
    if (!ruta || !pos) return null
    const p = ruta.pasos[indice]
    return p ? { ...p, faltan: distanciaKm(pos, p) * 1000 } : null
  }, [ruta, pos, indice])

  if (destino === undefined) return <p className="vacio">Cargando…</p>
  if (!destino) return <p className="vacio">No se encontró el establecimiento.</p>

  const centro = [destino.lat, destino.lon]
  // Restante por calles: hasta la próxima maniobra + los tramos que siguen.
  const restante =
    ruta && pos && ruta.pasos[indice]
      ? Math.min(ruta.distancia, distanciaKm(pos, ruta.pasos[indice]) * 1000 + ruta.pasos.slice(indice).reduce((a, p) => a + p.distancia, 0))
      : distanciaDirecta

  return (
    <div className={`navegar ${navegando ? 'navegando' : ''}`}>
      <header className="navegar-header">
        <button className="btn-link" onClick={() => (navegando ? setNavegando(false) : navigate(-1))}>
          ← {navegando ? 'Salir de la navegación' : 'Volver'}
        </button>
        <h1>{destino.nombre}</h1>
        <p className="nota">{destino.calle ? `${destino.calle} · ` : ''}{destino.partido}</p>
      </header>

      {navegando && proximo && !llegaste && (
        <div className="instruccion" role="status" aria-live="polite">
          <span className="instruccion-dist">{formatoMetros(proximo.faltan)}</span>
          <span className="instruccion-texto">{proximo.texto}</span>
        </div>
      )}
      {llegaste && <div className="instruccion instruccion-llegada" role="status">Llegaste a {destino.nombre}</div>}

      <div className="mapa">
        <MapContainer center={centro} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }} attributionControl>
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
          />
          {ruta && <Polyline positions={ruta.linea} pathOptions={{ color: '#007a8a', weight: 6, opacity: 0.85 }} />}
          {!ruta && pos && <Polyline positions={[[pos.lat, pos.lon], centro]} pathOptions={{ color: '#007a8a', weight: 3, dashArray: '6 8' }} />}
          <CircleMarker center={centro} radius={11} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#e72276', fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -10]} permanent={!navegando}>{destino.nombre}</Tooltip>
          </CircleMarker>
          {pos && (
            <>
              {pos.precision < 200 && <CircleMarker center={[pos.lat, pos.lon]} radius={22} pathOptions={{ stroke: false, fillColor: '#00aec3', fillOpacity: 0.18 }} />}
              <CircleMarker center={[pos.lat, pos.lon]} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#007a8a', fillOpacity: 1 }}>
                <Tooltip direction="bottom">Estás acá</Tooltip>
              </CircleMarker>
            </>
          )}
          <Encuadre ruta={ruta} pos={pos} destino={destino} navegando={navegando} />
        </MapContainer>
      </div>

      <section className="navegar-panel">
        {errorGps && <p className="banner-alerta">{errorGps}</p>}
        {!pos && !errorGps && <p className="nota">Buscando tu ubicación…</p>}

        {pos && (
          <>
            <div className="chips" role="tablist" aria-label="Cómo vas">
              <button role="tab" aria-selected={modo === 'pie'} className={`chip ${modo === 'pie' ? 'activo' : ''}`} onClick={() => setModo('pie')}>A pie</button>
              <button role="tab" aria-selected={modo === 'auto'} className={`chip ${modo === 'auto' ? 'activo' : ''}`} onClick={() => setModo('auto')}>En auto</button>
            </div>

            <div className="navegar-resumen">
              {ruta && estadoRuta === 'ok' ? (
                <>
                  <span className="navegar-cifra">{formatoDuracion(ruta.duracion * Math.min(1, restante / ruta.distancia))}</span>
                  <span className="nota">{formatoMetros(restante)} {modo === 'pie' ? 'caminando' : 'en auto'}</span>
                </>
              ) : estadoRuta === 'calculando' ? (
                <span className="nota">Calculando el recorrido…</span>
              ) : (
                <>
                  <span className="navegar-cifra">{formatoMetros(distanciaDirecta)}</span>
                  <span className="nota">en línea recta hacia el {rumbo(rumboEntre(pos, destino))}</span>
                </>
              )}
            </div>

            {estadoRuta === 'sin_conexion' && (
              <p className="banner-alerta">Sin conexión: te mostramos la dirección y la distancia en línea recta. El recorrido por calles se calcula al volver la señal.</p>
            )}
            {estadoRuta === 'error' && (
              <p className="banner-alerta">
                No pudimos calcular el recorrido por calles. <button className="btn-link" onClick={() => recalcular(pos)}>Reintentar</button>
              </p>
            )}

            {!navegando && !llegaste && (
              <button className="btn btn-primario btn-grande" onClick={() => setNavegando(true)}>Iniciar navegación</button>
            )}

            {ruta && !navegando && (
              <details className="pasos-ruta">
                <summary>Ver indicaciones ({ruta.pasos.length})</summary>
                <ol>
                  {ruta.pasos.map((p, i) => (
                    <li key={i}>
                      <span>{p.texto}</span>
                      {p.distancia > 0 && <span className="nota">{formatoMetros(p.distancia)}</span>}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        )}
        <p className="nota navegar-legal">
          Recorrido calculado con OpenStreetMap. Para calcularlo se envían sólo el punto de partida y el de llegada; tu ubicación no se guarda.
          Prestá atención al tránsito y a las señales.
        </p>
      </section>
    </div>
  )
}
