import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db.js'
import { filtrarPorTexto, formatoDistancia, masCercanos, useUbicacion } from '../lib/geo.js'

/**
 * Buscador de hospitales o CAPS de la provincia por nombre/partido o por cercanía.
 * - `origen`: punto de referencia fijo (p. ej. el CAPS que deriva). Si no hay,
 *   se ofrece usar la ubicación del dispositivo.
 * - `autoElegirCercano`: al obtener la ubicación, elige el más cercano.
 */
export default function BuscadorEfector({ tipo, valor, onElegir, origen = null, autoElegirCercano = true, etiqueta, max = 8 }) {
  const todos = useLiveQuery(() => db.efectores.where('tipo').equals(tipo).toArray(), [tipo], [])
  const ubic = useUbicacion()
  const [texto, setTexto] = useState('')
  const referencia = ubic.coords ?? origen

  const resultados = useMemo(() => {
    const filtrados = filtrarPorTexto(todos, texto)
    if (referencia) return masCercanos(filtrados, referencia, max)
    return texto ? filtrados.slice(0, max) : []
  }, [todos, texto, referencia, max])

  // Con ubicación nueva, sugerir el más cercano.
  useEffect(() => {
    if (ubic.coords && autoElegirCercano && resultados[0] && !texto) onElegir(resultados[0])
  }, [ubic.coords]) // eslint-disable-line react-hooks/exhaustive-deps

  const elegido = valor ? todos.find((x) => x.id === valor) : null
  const noun = tipo === 'caps' ? 'CAPS' : 'hospital'

  return (
    <div className="buscador">
      {elegido && (
        <div className="buscador-elegido">
          <div>
            <strong>{elegido.nombre}</strong>
            <span className="nota">{elegido.partido}{referencia ? ` · a ${formatoDistancia(masCercanos([elegido], referencia)[0].distancia)}` : ''}</span>
          </div>
          <span className="badge badge-ok">Elegido</span>
        </div>
      )}

      <div className="buscador-barra">
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={`Buscar ${noun} por nombre o partido`}
          aria-label={etiqueta ?? `Buscar ${noun}`}
        />
        <button type="button" className="btn btn-ubicacion" onClick={ubic.pedir} disabled={ubic.cargando} title="Usar mi ubicación">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.94 3A9 9 0 0 0 13 3.06V1h-2v2.06A9 9 0 0 0 3.06 11H1v2h2.06A9 9 0 0 0 11 20.94V23h2v-2.06A9 9 0 0 0 20.94 13H23v-2h-2.06ZM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z" /></svg>
          <span>{ubic.cargando ? 'Ubicando…' : 'Cerca mío'}</span>
        </button>
      </div>

      {ubic.error && <p className="campo-error">{ubic.error}</p>}
      {ubic.coords && <p className="nota">Ordenados por distancia a tu ubicación.</p>}
      {!ubic.coords && origen && !texto && <p className="nota">Ordenados por distancia al CAPS que deriva.</p>}

      {resultados.length > 0 && (
        <ul className="buscador-lista" role="listbox" aria-label={`${noun} sugeridos`}>
          {resultados.map((x, i) => (
            <li key={x.id}>
              <button type="button" role="option" aria-selected={x.id === valor} className={`buscador-item ${x.id === valor ? 'activo' : ''}`} onClick={() => onElegir(x)}>
                <span className="buscador-nombre">
                  {x.nombre}
                  {referencia && i === 0 && !texto && <span className="badge badge-info">Más cercano</span>}
                </span>
                <span className="nota">{x.partido}{x.calle ? ` · ${x.calle}` : ''}</span>
                {x.distancia != null && <span className="buscador-dist">{formatoDistancia(x.distancia)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {texto && resultados.length === 0 && <p className="nota">No hay {noun === 'CAPS' ? 'CAPS' : 'hospitales'} con ese nombre o partido.</p>}
    </div>
  )
}
