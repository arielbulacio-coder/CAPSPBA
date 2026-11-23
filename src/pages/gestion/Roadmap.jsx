import { useState } from 'react'
import { Tarjeta } from '../../components/Comunes.jsx'
import {
  ANIO_INICIO, HORIZONTES, INICIATIVAS, METAS, PERIODOS, PROGRAMAS, PRESUPUESTO_USD,
  conflictosDependencias, enParalelo,
} from '../../lib/portafolio.js'

const RIESGO = { A: ['Alto', 'error'], M: ['Medio', 'alerta'], B: ['Bajo', 'ok'] }
const anios = [...new Set(PERIODOS.map((p) => p.anio))]

function Detalle({ i, onCerrar }) {
  const [riesgo, tono] = RIESGO[i.riesgo]
  return (
    <Tarjeta
      className={`rm-detalle rm-borde-${i.horizonte}`}
      titulo={`${i.id} · ${i.nombre}`}
      accion={<button className="btn-link" onClick={onCerrar}>Cerrar</button>}
    >
      <div className="botonera">
        <span className={`badge rm-badge-${i.horizonte}`}>{i.horizonte} · {HORIZONTES[i.horizonte].nombre}</span>
        <span className="badge badge-gris">Prioridad {i.prioridad}</span>
        {i.puntaje != null && <span className="badge badge-info">Matriz {i.puntaje.toLocaleString('es-AR')}</span>}
        <span className={`badge badge-${tono}`}>Riesgo {riesgo}</span>
      </div>
      <p className="rm-alcance">{i.alcance}</p>
      <dl className="dl">
        <dt>Programa</dt><dd>{i.programa}</dd>
        <dt>Objetivo</dt><dd>{i.objetivo}</dd>
        <dt>Depende de</dt><dd>{i.depende.length ? i.depende.join(', ') : '—'}</dd>
        <dt>Hito</dt><dd>{i.hito}</dd>
        <dt>Responsable</dt><dd>{i.responsable}</dd>
        <dt>Indicador</dt><dd>{i.indicador}</dd>
        <dt>Base → meta</dt><dd>{i.baseMeta}</dd>
        <dt>Sponsor</dt><dd>{i.sponsor}</dd>
      </dl>
      {i.enApp && <p className="banner-info"><strong>Ya en este prototipo:</strong> {i.enApp}</p>}
    </Tarjeta>
  )
}

export default function Roadmap() {
  const [sel, setSel] = useState(null)
  const [horiz, setHoriz] = useState('')
  const paralelo = enParalelo()
  const maxPar = Math.max(...paralelo)
  const conflictos = conflictosDependencias()
  const porHorizonte = Object.keys(HORIZONTES).map((h) => [h, INICIATIVAS.filter((i) => i.horizonte === h).length])
  const elegida = INICIATIVAS.find((i) => i.id === sel)

  return (
    <>
      <div className="encabezado">
        <h1>Roadmap {ANIO_INICIO}–{ANIO_INICIO + 2}</h1>
        <span className="badge badge-gris">Entregable 4</span>
      </div>
      <p className="nota">
        Portafolio de transformación digital del Ministerio Provincial de Salud: {INICIATIVAS.length} iniciativas en {PROGRAMAS.length} programas.
        El primer año va por trimestre; el segundo y el tercero, por semestre: cuanto más lejos, menos certeza.
        Presupuesto de referencia: USD {PRESUPUESTO_USD.toLocaleString('es-AR')}.
      </p>

      <div className="indicadores">
        {porHorizonte.map(([h, n]) => (
          <button key={h} className={`indicador rm-filtro rm-borde-${h} ${horiz === h ? 'rm-filtro-activo' : ''}`} onClick={() => setHoriz(horiz === h ? '' : h)} aria-pressed={horiz === h}>
            <span className="ind-titulo">{h} · {HORIZONTES[h].nombre}</span>
            <span className="ind-valor">{n}<span className="ind-unidad"> iniciativas</span></span>
            <span className="ind-ref">{HORIZONTES[h].desc}</span>
          </button>
        ))}
      </div>

      {elegida && <Detalle i={elegida} onCerrar={() => setSel(null)} />}

      <Tarjeta titulo="Cronograma por programa">
        <p className="nota">Tocá una iniciativa para ver alcance, hito, responsable e indicador.{horiz && <> Filtrando {horiz}. <button className="btn-link" onClick={() => setHoriz('')}>Ver todas</button></>}</p>
        <div className="tabla-scroll">
          <table className="rm-tabla">
            <thead>
              <tr>
                <th rowSpan={2} className="rm-col-ini">Iniciativa</th>
                {anios.map((a) => (
                  <th key={a} colSpan={PERIODOS.filter((p) => p.anio === a).length} className="rm-anio">
                    {a} · {a === ANIO_INICIO ? 'trimestral' : 'semestral'}
                  </th>
                ))}
              </tr>
              <tr>
                {PERIODOS.map((p) => <th key={p.id} className={`rm-per ${p.label === 'T1' || p.label === 'S1' ? 'rm-corte' : ''}`}>{p.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {PROGRAMAS.map((prog) => {
                const filas = prog.iniciativas.filter((i) => !horiz || i.horizonte === horiz).sort((a, b) => a.prioridad - b.prioridad)
                if (!filas.length) return null
                return [
                  <tr key={prog.id} className="rm-programa"><td colSpan={PERIODOS.length + 1}>{prog.nombre}</td></tr>,
                  ...filas.map((i) => (
                    <tr key={i.id} className={sel === i.id ? 'rm-sel' : ''}>
                      <td className="rm-col-ini">
                        <button className="rm-ini" onClick={() => setSel(sel === i.id ? null : i.id)}>
                          <span className="rm-id">{i.id}</span>
                          <span className="rm-nombre">{i.nombre}</span>
                          {i.depende.length > 0 && <span className="rm-dep">← {i.depende.join(', ')}</span>}
                        </button>
                      </td>
                      {PERIODOS.map((p) => (
                        <td key={p.id} className={`rm-celda ${p.label === 'T1' || p.label === 'S1' ? 'rm-corte' : ''}`}>
                          {i.periodos.includes(p.id) && <span className={`rm-barra rm-${i.horizonte}`} title={`${i.id} · ${p.anio} ${p.label}`} />}
                        </td>
                      ))}
                    </tr>
                  )),
                ]
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="rm-col-ini"><strong>Iniciativas en paralelo</strong></td>
                {paralelo.map((n, k) => (
                  <td key={PERIODOS[k].id} className={`rm-celda rm-par ${n === maxPar ? 'rm-par-max' : ''}`}>{n}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="rm-leyenda">
          {Object.entries(HORIZONTES).map(([h, v]) => (
            <span key={h}><span className={`rm-barra rm-${h}`} /> {h} · {v.nombre}</span>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Lista de chequeo" className={conflictos.length ? 'tarjeta-alerta' : 'tarjeta-ok'}>
        <ul className="rm-check">
          <li className={conflictos.length ? 'mal' : 'bien'}>
            {conflictos.length
              ? `Hay iniciativas que arrancan antes que sus dependencias: ${conflictos.map((c) => `${c.iniciativa} ← ${c.depende}`).join(', ')}`
              : 'Ninguna iniciativa arranca antes que algo de lo que depende (verificado automáticamente).'}
          </li>
          <li className="bien">No está todo en H1: {porHorizonte.map(([h, n]) => `${n} en ${h}`).join(', ')}.</li>
          <li className={maxPar > 5 ? 'mal' : 'bien'}>Pico de {maxPar} iniciativas en paralelo (2028): exigente para un equipo de 22 personas; por eso P07, P09 y la IA quedan para 2029.</li>
          <li className="bien">Cada iniciativa tiene un hito observable con su período.</li>
          <li className="bien">Las dos trampas del anexo: P01 cupo protegido entra en T1 sin tecnología; P04, P06 y P10 se licitan antes del mes 12 por el plazo BID.</li>
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Hitos observables">
        <ol className="lista rm-hitos">
          {INICIATIVAS.slice().sort((a, b) => PERIODOS.findIndex((p) => p.id === a.periodos[0]) - PERIODOS.findIndex((p) => p.id === b.periodos[0]) || a.prioridad - b.prioridad)
            .filter((i) => !horiz || i.horizonte === horiz)
            .map((i) => (
              <li key={i.id} className={`item rm-borde-${i.horizonte}`}>
                <div className="item-principal">
                  <strong>{i.id} · {i.nombre}</strong>
                  <span className="item-sub">{i.hito}</span>
                  <span className="nota">{i.responsable} · {i.indicador}: {i.baseMeta}</span>
                </div>
                <div className="item-lateral">
                  {i.metas.map((m) => <span key={m} className="badge badge-gris" title={METAS.find((x) => x.id === m).titulo}>{m.replace('M', 'Meta ')}</span>)}
                </div>
              </li>
            ))}
        </ol>
      </Tarjeta>
    </>
  )
}
