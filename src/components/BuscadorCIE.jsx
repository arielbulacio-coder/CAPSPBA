import { useState } from 'react'
import { buscarCIE } from '../lib/hcu.js'

/** Selector de diagnósticos con codificación común CIE-10 (admite texto libre). */
export default function BuscadorCIE({ valor = [], onCambiar, multiple = true, placeholder = 'Buscar diagnóstico (CIE-10)' }) {
  const [texto, setTexto] = useState('')
  const opciones = buscarCIE(texto).filter((o) => !valor.some((v) => v.codigo === o.codigo))

  const agregar = (dx) => {
    onCambiar(multiple ? [...valor, dx] : [dx])
    setTexto('')
  }

  return (
    <div className="cie">
      {valor.length > 0 && (
        <ul className="cie-elegidos">
          {valor.map((d, i) => (
            <li key={`${d.codigo}-${i}`} className="chip activo">
              {d.codigo && <span className="cie-codigo">{d.codigo}</span>} {d.texto}
              <button type="button" aria-label={`Quitar ${d.texto}`} onClick={() => onCambiar(valor.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ul>
      )}
      {(multiple || valor.length === 0) && (
        <>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
          {texto.trim().length > 1 && (
            <ul className="cie-opciones" role="listbox">
              {opciones.map((o) => (
                <li key={o.codigo}>
                  <button type="button" role="option" aria-selected="false" onClick={() => agregar(o)}>
                    <span className="cie-codigo">{o.codigo}</span> {o.texto}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" className="cie-libre" onClick={() => agregar({ codigo: null, texto: texto.trim() })}>
                  Usar “{texto.trim()}” sin código
                </button>
              </li>
            </ul>
          )}
        </>
      )}
    </div>
  )
}
