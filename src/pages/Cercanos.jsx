import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db.js'
import { enlaceComoLlegar, filtrarPorTexto, formatoDistancia, masCercanos, useUbicacion } from '../lib/geo.js'

// Pantalla pública: ¿cuál es mi CAPS más cercano? No requiere perfil ni datos personales;
// la ubicación se usa sólo en el dispositivo y no se guarda.
export default function Cercanos() {
  const ubic = useUbicacion()
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('caps')
  const todos = useLiveQuery(() => db.efectores.where('tipo').equals(tipo).toArray(), [tipo], [])
  const padron = useLiveQuery(() => db.meta.get('padron'), [])

  const lista = useMemo(() => {
    const f = filtrarPorTexto(todos, texto)
    if (ubic.coords) return masCercanos(f, ubic.coords, 10)
    return texto ? f.slice(0, 20) : []
  }, [todos, texto, ubic.coords])

  return (
    <div className="inicio">
      <header className="inicio-header">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="48" height="48" />
        <h1>{tipo === 'caps' ? 'Tu CAPS más cercano' : 'Hospitales cercanos'}</h1>
        <p>Centros de atención primaria y hospitales públicos de la Provincia de Buenos Aires.</p>
      </header>

      <div className="chips" role="tablist">
        <button role="tab" aria-selected={tipo === 'caps'} className={`chip ${tipo === 'caps' ? 'activo' : ''}`} onClick={() => setTipo('caps')}>CAPS / centros de salud</button>
        <button role="tab" aria-selected={tipo === 'hospital'} className={`chip ${tipo === 'hospital' ? 'activo' : ''}`} onClick={() => setTipo('hospital')}>Hospitales</button>
      </div>

      <button className="btn btn-primario btn-grande" onClick={ubic.pedir} disabled={ubic.cargando}>
        {ubic.cargando ? 'Buscando tu ubicación…' : ubic.coords ? 'Actualizar mi ubicación' : 'Usar mi ubicación'}
      </button>
      <p className="nota centrado">Tu ubicación se usa sólo en este teléfono para calcular distancias. No se envía ni se guarda.</p>
      {ubic.error && <p className="banner-alerta">{ubic.error}</p>}

      <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O buscá por nombre, partido o calle" aria-label="Buscar por nombre, partido o calle" />

      {lista.length > 0 && (
        <ul className="lista">
          {lista.map((x, i) => (
            <li key={x.id} className={`item item-estatico ${i === 0 && ubic.coords && !texto ? 'item-destacado' : ''}`}>
              <div className="item-principal">
                {i === 0 && ubic.coords && !texto && <span className="badge badge-ok">El más cercano</span>}
                <strong>{x.nombre}</strong>
                <span className="item-sub">{x.calle ? `${x.calle} · ` : ''}{x.partido}</span>
              </div>
              <div className="item-lateral">
                {x.distancia != null && <span className="item-dist">{formatoDistancia(x.distancia)}</span>}
                <a className="btn btn-chico" href={enlaceComoLlegar(x)} target="_blank" rel="noopener noreferrer">Cómo llegar</a>
              </div>
            </li>
          ))}
        </ul>
      )}
      {texto && lista.length === 0 && <p className="vacio">No encontramos establecimientos con ese nombre.</p>}

      <footer className="inicio-pie">
        <p>Fuente: {padron?.fuente ?? 'padrón de establecimientos'} · actualizado {padron?.version ?? '—'}.</p>
        <p>Verificá horarios en el establecimiento. Ante una emergencia llamá al 107 o al 911.</p>
        <Link to="/">← Volver</Link>
      </footer>
    </div>
  )
}
