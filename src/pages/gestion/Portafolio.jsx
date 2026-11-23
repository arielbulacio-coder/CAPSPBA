import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Tarjeta } from '../../components/Comunes.jsx'
import { BRECHAS, CADENA, CRITERIOS, DECISIONES, MATRIZ, METAS, TRAMPAS, puntajePonderado } from '../../lib/portafolio.js'

const fmt = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Portafolio() {
  const [orden, setOrden] = useState('total')
  const filas = MATRIZ.map((m) => ({ ...m, total: puntajePonderado(m.p) }))
  filas.sort((a, b) => (orden === 'total' ? b.total - a.total : a.id.localeCompare(b.id)))
  const grupos = Object.keys(DECISIONES).map((d) => [d, filas.filter((f) => f.decision === d)])

  return (
    <>
      <div className="encabezado">
        <h1>Portafolio priorizado</h1>
        <span className="badge badge-gris">Entregable 3</span>
      </div>
      <p className="nota">
        Alineación y priorización del portafolio de transformación digital frente a las 3 metas del Plan Provincial de Salud.
        El puntaje ordena, el comité decide. <Link to="/gestion/roadmap">Ver el roadmap 2027–2029 →</Link>
      </p>

      <div className="indicadores">
        {METAS.map((m) => (
          <div key={m.id} className="indicador">
            <span className="ind-titulo">{m.id.replace('M', 'Meta ')} · {m.titulo}</span>
            <span className="ind-valor">{m.meta}</span>
            <span className="ind-ref">Línea de base: {m.base}</span>
          </div>
        ))}
      </div>

      <Tarjeta titulo="Decisión del comité">
        <div className="pf-decisiones">
          {grupos.map(([d, lista]) => (
            <div key={d} className={`pf-columna pf-${DECISIONES[d].tono}`}>
              <h3><span className={`badge badge-${DECISIONES[d].tono}`}>{DECISIONES[d].label}</span> <span className="nota">{lista.length}</span></h3>
              <ul>
                {lista.map((f) => (
                  <li key={f.id}><strong>{f.id}</strong> {f.nombre}{f.nota && <span className="nota"> · {f.nota}</span>}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Matriz ponderada"
        accion={
          <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar matriz" style={{ width: 'auto' }}>
            <option value="total">Por puntaje</option>
            <option value="id">Por ID</option>
          </select>
        }
      >
        <p className="nota">Escala 1–5 (5 = mejor; en costo, recurrente y riesgo, 5 = bajo). El total se recalcula con los pesos de abajo.</p>
        <div className="tabla-scroll">
          <table className="tabla pf-matriz">
            <thead>
              <tr>
                <th>ID</th>
                <th>Iniciativa</th>
                {CRITERIOS.map((c) => <th key={c.id} title={`${c.nombre} (${c.peso}%)`}>{c.corto}<span className="pf-peso">{c.peso}%</span></th>)}
                <th>Total</th>
                <th>Cuadrante</th>
                <th>Decisión</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={f.decision === 'descarta' ? 'pf-descartada' : ''}>
                  <td><strong>{f.id}</strong></td>
                  <td className="pf-nombre">{f.nombre}</td>
                  {f.p.map((v, k) => <td key={k} className={`pf-v pf-v${v}`}>{v}</td>)}
                  <td><strong>{fmt(f.total)}</strong></td>
                  <td>{f.cuadrante}</td>
                  <td><span className={`badge badge-${DECISIONES[f.decision].tono}`}>{DECISIONES[f.decision].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="nota">P04 queda abajo y entra igual, porque de ella cuelga casi todo; P09 queda arriba y espera, porque no mueve ninguna meta y no sobran personas.</p>
      </Tarjeta>

      <Tarjeta titulo="Criterios y pesos">
        <ul className="lista">
          {CRITERIOS.map((c) => (
            <li key={c.id} className="pf-criterio">
              <div className="pf-criterio-cab">
                <strong>{c.nombre}</strong>
                <span className="pf-criterio-peso">{c.peso}%</span>
              </div>
              <div className="barra"><div className="barra-relleno" style={{ width: `${c.peso * 5}%` }} /></div>
              <span className="nota">{c.porque}</span>
            </li>
          ))}
        </ul>
        <p className="nota">Alineación e impacto suman 30%; factibilidad, madurez del dato y costo recurrente suman 40%. Con USD 4 millones y 22 personas, el cuello de botella no es la plata: es quién lo ejecuta y quién lo paga después del préstamo.</p>
      </Tarjeta>

      <Tarjeta titulo="Las dos trampas del anexo">
        {TRAMPAS.map((t, k) => (
          <div key={k} className="banner-alerta">
            <strong>Trampa {k + 1} · {t.titulo}</strong>
            <p className="pf-trampa">{t.texto}</p>
          </div>
        ))}
      </Tarjeta>

      <Tarjeta titulo="La brecha que bloquea">
        <div className="tabla-scroll">
          <table className="tabla pf-brechas">
            <thead><tr><th>Dimensión</th><th>Estado en el caso</th><th>Alineación</th></tr></thead>
            <tbody>
              {BRECHAS.map((b) => (
                <tr key={b.dimension}>
                  <td><strong>{b.dimension}</strong></td>
                  <td>{b.estado}</td>
                  <td><span className={`badge badge-${b.tono}`}>{b.alineacion}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="nota">No es «falta de sistemas»: falta una decisión de gobierno sobre quién es dueño del dato y con qué regla se identifica a un paciente. Comprar un sistema más sin esa regla reproduce el 12% de duplicados en un lugar nuevo.</p>
      </Tarjeta>

      <Tarjeta titulo="Cadena de dependencias">
        <ol className="pf-cadena">
          {CADENA.map((c) => <li key={c}>{c}</li>)}
        </ol>
        <p className="nota">8 de las 12 iniciativas cuelgan de P04 y sólo 3 son independientes (P01, P09, P10): por eso P04 entra aunque su puntaje sea medio.</p>
      </Tarjeta>
    </>
  )
}
