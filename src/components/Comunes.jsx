import { ESTADOS } from '../lib/db.js'

export function EstadoBadge({ estado }) {
  const e = ESTADOS[estado] ?? { label: estado, tono: 'gris' }
  return <span className={`badge badge-${e.tono}`}>{e.label}</span>
}

export function Vacio({ children }) {
  return <p className="vacio">{children}</p>
}

export function Cargando() {
  return <p className="vacio">Cargando…</p>
}

export function Campo({ label, error, ayuda, children }) {
  return (
    <label className="campo">
      <span className="campo-label">{label}</span>
      {children}
      {ayuda && !error && <span className="campo-ayuda">{ayuda}</span>}
      {error && <span className="campo-error">{error}</span>}
    </label>
  )
}

export function Tarjeta({ titulo, accion, children, className = '' }) {
  return (
    <section className={`tarjeta ${className}`}>
      {(titulo || accion) && (
        <header className="tarjeta-header">
          {titulo && <h2>{titulo}</h2>}
          {accion}
        </header>
      )}
      {children}
    </section>
  )
}
