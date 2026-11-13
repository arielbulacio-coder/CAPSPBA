import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../AppContext.jsx'
import { db } from '../../lib/db.js'
import { edad, fechaCorta, hoyISO, sumarDias } from '../../lib/fechas.js'
import { buscarPosiblesDuplicados, nombreCompleto } from '../../lib/pacientes.js'
import {
  FUENTES, TIPOS_ENCUENTRO, agregarMedicacion, agregarProblema, guardarAlergias, nombreProfesional, obtenerHistoria,
  recordarProfesional, registrarAcceso, registrarEncuentro, resolverProblema, suspenderMedicacion, unificarPacientes,
} from '../../lib/hcu.js'
import { Campo, EstadoBadge, Tarjeta, Vacio, Cargando } from '../../components/Comunes.jsx'
import BuscadorCIE from '../../components/BuscadorCIE.jsx'

const PESTANAS = { resumen: 'Resumen', linea: 'Línea de tiempo', nueva: 'Nueva evolución' }
const FILTROS = {
  todo: ['Todo', () => true],
  consultas: ['Consultas', (x) => x.clase === 'encuentro' && x.tipo !== 'teleconsulta'],
  tele: ['Teleconsultas', (x) => x.tipo === 'teleconsulta'],
  derivaciones: ['Derivaciones', (x) => x.clase === 'derivacion'],
}

export default function HistoriaClinica() {
  const { id } = useParams()
  const { perfil, notificar } = useApp()
  const [pestana, setPestana] = useState('resumen')
  const [filtro, setFiltro] = useState('todo')
  const base = `/${perfil.rol}`

  const h = useLiveQuery(() => obtenerHistoria(id), [id])
  const miEfector = useLiveQuery(() => (perfil.efectorId ? db.efectores.get(perfil.efectorId) : null), [perfil.efectorId])
  const duplicados = useLiveQuery(async () => {
    const p = await db.pacientes.get(id)
    if (!p) return []
    return (await buscarPosiblesDuplicados({ dni: p.dni, apellido: p.apellido, fechaNac: p.fechaNac })).filter((x) => !x.fusionadoCon)
  }, [id], [])

  useEffect(() => {
    if (miEfector !== undefined) registrarAcceso(id, perfil, miEfector?.nombre)
  }, [id, miEfector?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!h) return <Cargando />
  const { paciente: p } = h
  if (!p) return <p className="vacio">No se encontró la historia. <Link to={`${base}/pacientes`}>Buscar paciente</Link></p>
  if (p.fusionadoCon) return <Navigate to={`${base}/hcu/${p.fusionadoCon}`} replace />

  const unificar = async (dup) => {
    if (!confirm(`¿Confirmás que ${nombreCompleto(dup)} (DNI ${dup.dni}) es la misma persona que ${nombreCompleto(p)} (DNI ${p.dni})?\n\nTodo su registro pasa a esta historia. Verificalo con el DNI físico.`)) return
    await unificarPacientes(p.id, dup.id, miEfector?.nombre ?? perfil.rol)
    notificar('Historias unificadas: ahora es una sola historia clínica.')
  }

  const problemasActivos = h.problemas.filter((x) => x.estado === 'activo')
  const medActiva = h.medicacion.filter((m) => m.activa)
  const ultimaHba1c = h.signos.find((s) => s.hba1c)
  const sinControl = p.cronico?.length && (!p.ultimoControl || p.ultimoControl < sumarDias(hoyISO(), -365))

  return (
    <>
      <div className="encabezado"><Link to={`${base}/pacientes`} className="btn-link">← Pacientes</Link></div>

      <header className="hc-cabecera">
        <div>
          <h1>{nombreCompleto(p)}</h1>
          <p className="nota">
            DNI {p.dni}{p.dnisAnteriores?.length ? ` (antes: ${p.dnisAnteriores.join(', ')})` : ''} · {edad(p.fechaNac)} años · nac. {fechaCorta(p.fechaNac)}
          </p>
          <p className="nota">CAPS de referencia: {h.caps?.nombre ?? '—'}{h.caps ? ` · ${h.caps.partido}` : ''}</p>
        </div>
        <div className="hc-etiquetas">
          {p.cronico?.map((c) => <span key={c} className="badge badge-info">{c === 'DBT' ? 'Diabetes' : c === 'HTA' ? 'Hipertensión' : c}</span>)}
        </div>
      </header>

      <Alergias paciente={p} />

      {duplicados.length > 0 && (
        <div className="banner-alerta">
          <strong>Posible registro duplicado.</strong> Puede ser la misma persona cargada con otro DNI o en otro efector:
          <ul className="duplicados">
            {duplicados.map((d) => (
              <li key={d.id}>
                <span>{nombreCompleto(d)} · DNI {d.dni} · nac. {fechaCorta(d.fechaNac)}</span>
                <button className="btn btn-chico" onClick={() => unificar(d)}>Es la misma persona: unificar</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="chips" role="tablist">
        {Object.entries(PESTANAS).map(([k, v]) => (
          <button key={k} role="tab" aria-selected={pestana === k} className={`chip ${pestana === k ? 'activo' : ''}`} onClick={() => setPestana(k)}>{v}</button>
        ))}
      </div>

      {pestana === 'resumen' && (
        <>
          {(sinControl || (ultimaHba1c && ultimaHba1c.hba1c > 7)) && (
            <div className="banner-info">
              {sinControl && <div>Sin control registrado en los últimos 12 meses.</div>}
              {ultimaHba1c && ultimaHba1c.hba1c > 7 && <div>Última HbA1c {ultimaHba1c.hba1c}% ({fechaCorta(ultimaHba1c.fecha)}): por encima del objetivo.</div>}
            </div>
          )}
          <Problemas pacienteId={p.id} problemas={h.problemas} activos={problemasActivos} />
          <Medicacion pacienteId={p.id} activa={medActiva} historica={h.medicacion.filter((m) => !m.activa)} prescriptor={miEfector?.nombre} />
          <Tarjeta titulo="Signos y laboratorio">
            {h.signos.length === 0 ? <Vacio>Sin registros.</Vacio> : (
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead><tr><th>Fecha</th><th>TA</th><th>Peso</th><th>Glucemia</th><th>HbA1c</th></tr></thead>
                  <tbody>
                    {h.signos.map((s, i) => (
                      <tr key={i}>
                        <td>{fechaCorta(s.fecha)}</td>
                        <td>{s.taSis ? `${s.taSis}/${s.taDia}` : '—'}</td>
                        <td>{s.peso ? `${s.peso} kg` : '—'}</td>
                        <td className={s.glucemia > 130 ? 'fuera-rango' : ''}>{s.glucemia ? `${s.glucemia} mg/dl` : '—'}</td>
                        <td className={s.hba1c > 7 ? 'fuera-rango' : ''}>{s.hba1c ? `${s.hba1c}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
          <button className="btn btn-primario" onClick={() => setPestana('nueva')}>+ Registrar evolución</button>
        </>
      )}

      {pestana === 'linea' && (
        <>
          <div className="chips">
            {Object.entries(FILTROS).map(([k, [label]]) => (
              <button key={k} className={`chip ${filtro === k ? 'activo' : ''}`} onClick={() => setFiltro(k)}>{label}</button>
            ))}
          </div>
          <LineaDeTiempo items={h.linea.filter(FILTROS[filtro][1])} />
        </>
      )}

      {pestana === 'nueva' && (
        <NuevaEvolucion
          pacienteId={p.id}
          efectorId={perfil.efectorId}
          onGuardado={() => {
            notificar('Evolución registrada en la historia clínica.')
            setPestana('linea')
            setFiltro('todo')
          }}
        />
      )}
    </>
  )
}

function Alergias({ paciente }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const lista = paciente.alergias ?? []
  const guardar = async () => {
    await guardarAlergias(paciente.id, texto.split(',').map((x) => x.trim()).filter(Boolean))
    setEditando(false)
  }
  return (
    <div className={`hc-alergias ${lista.length ? 'con-alergias' : ''}`}>
      {editando ? (
        <div className="fila-agendar">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Separadas por coma (o vacío si no tiene)" aria-label="Alergias" />
          <button className="btn btn-chico btn-primario" onClick={guardar}>Guardar</button>
        </div>
      ) : (
        <>
          <span><strong>Alergias:</strong> {lista.length ? lista.join(', ') : 'No registra'}</span>
          <button className="btn-link" onClick={() => { setTexto(lista.join(', ')); setEditando(true) }}>Editar</button>
        </>
      )}
    </div>
  )
}

function Problemas({ pacienteId, problemas, activos }) {
  const [nuevo, setNuevo] = useState([])
  const resueltos = problemas.filter((x) => x.estado !== 'activo')
  const agregar = async (lista) => {
    if (!lista.length) return
    await agregarProblema(pacienteId, lista[0])
    setNuevo([])
  }
  return (
    <Tarjeta titulo="Problemas de salud">
      {activos.length === 0 ? <Vacio>Sin problemas activos registrados.</Vacio> : (
        <ul className="lista">
          {activos.map((x) => (
            <li key={x.id} className="item item-estatico">
              <div className="item-principal">
                <strong>{x.codigo && <span className="cie-codigo">{x.codigo}</span>} {x.texto}</strong>
                <span className="item-sub">Desde {fechaCorta(x.desde)}</span>
              </div>
              <button className="btn btn-chico" onClick={() => resolverProblema(x.id)}>Marcar resuelto</button>
            </li>
          ))}
        </ul>
      )}
      <BuscadorCIE valor={nuevo} onCambiar={(l) => { setNuevo(l); agregar(l) }} multiple={false} placeholder="Agregar problema (CIE-10)" />
      {resueltos.length > 0 && <p className="nota">Resueltos: {resueltos.map((x) => x.texto).join(' · ')}</p>}
    </Tarjeta>
  )
}

function Medicacion({ pacienteId, activa, historica, prescriptor }) {
  const [form, setForm] = useState(null)
  const guardar = async (e) => {
    e.preventDefault()
    if (!form.droga.trim()) return
    await agregarMedicacion(pacienteId, { ...form, prescriptor: prescriptor ?? '' })
    setForm(null)
  }
  return (
    <Tarjeta titulo="Medicación activa" accion={!form && <button className="btn btn-chico" onClick={() => setForm({ droga: '', dosis: '' })}>+ Agregar</button>}>
      {activa.length === 0 ? <Vacio>Sin medicación activa.</Vacio> : (
        <ul className="lista">
          {activa.map((m) => (
            <li key={m.id} className="item item-estatico">
              <div className="item-principal">
                <strong>{m.droga}</strong>
                <span className="item-sub">{m.dosis} · desde {fechaCorta(m.desde)}{m.prescriptor ? ` · ${m.prescriptor}` : ''}</span>
              </div>
              <button className="btn btn-chico btn-peligro" onClick={() => suspenderMedicacion(m.id)}>Suspender</button>
            </li>
          ))}
        </ul>
      )}
      {form && (
        <form onSubmit={guardar} className="grilla-2">
          <Campo label="Droga"><input value={form.droga} onChange={(e) => setForm({ ...form, droga: e.target.value })} autoFocus /></Campo>
          <Campo label="Dosis y frecuencia"><input value={form.dosis} onChange={(e) => setForm({ ...form, dosis: e.target.value })} placeholder="Ej.: 10 mg cada 12 h" /></Campo>
          <div className="botonera">
            <button className="btn btn-primario">Guardar</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {historica.length > 0 && <p className="nota">Suspendida: {historica.map((m) => `${m.droga} (${fechaCorta(m.hasta)})`).join(' · ')}</p>}
    </Tarjeta>
  )
}

export function LineaDeTiempo({ items, paraPaciente = false }) {
  if (!items.length) return <Vacio>Sin registros.</Vacio>
  return (
    <ol className="linea-tiempo">
      {items.map((x) => {
        const d = x.dato
        return (
          <li key={x.id} className={`lt-item lt-${x.tipo} ${x.futuro ? 'lt-futuro' : ''}`}>
            <div className="lt-fecha">{fechaCorta(x.fecha)}</div>
            <div className="lt-cuerpo">
              <div className="lt-titulo">
                <strong>{x.titulo}</strong>
                {x.clase === 'encuentro' && d.fuente && !paraPaciente && <span className={`badge badge-${d.fuente === 'papel' ? 'alerta' : 'gris'}`}>{FUENTES[d.fuente]}</span>}
                {x.clase === 'derivacion' && <EstadoBadge estado={d.estado} />}
              </div>
              <span className="nota">{x.efector?.nombre}{x.destino ? ` → ${x.destino.nombre}` : ''}{d.profesional ? ` · ${d.profesional}` : ''}</span>
              {x.clase === 'encuentro' && (
                <>
                  {d.motivo && <p><span className="lt-rotulo">Motivo:</span> {d.motivo}</p>}
                  {d.diagnosticos?.length > 0 && (
                    <p><span className="lt-rotulo">Diagnóstico:</span> {d.diagnosticos.map((dx) => `${dx.codigo ? `${dx.codigo} ` : ''}${dx.texto}`).join('; ')}</p>
                  )}
                  {!paraPaciente && d.evolucion && <p><span className="lt-rotulo">Evolución:</span> {d.evolucion}</p>}
                  {d.signos && Object.values(d.signos).some(Boolean) && (
                    <p className="nota">
                      {[d.signos.taSis && `TA ${d.signos.taSis}/${d.signos.taDia}`, d.signos.peso && `${d.signos.peso} kg`, d.signos.glucemia && `Glucemia ${d.signos.glucemia}`, d.signos.hba1c && `HbA1c ${d.signos.hba1c}%`].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {d.indicaciones && <p><span className="lt-rotulo">Indicaciones:</span> {d.indicaciones}</p>}
                </>
              )}
              {x.clase === 'derivacion' && (
                <>
                  <p><span className="lt-rotulo">Motivo:</span> {d.motivo}</p>
                  {d.turnoFecha && <p className="nota">Turno: {fechaCorta(d.turnoFecha)} {d.turnoHora} h</p>}
                </>
              )}
              {x.clase === 'control' && <p>{d.motivo}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function NuevaEvolucion({ pacienteId, efectorId, onGuardado }) {
  const [f, setF] = useState({ tipo: 'control', profesional: nombreProfesional(), motivo: '', evolucion: '', indicaciones: '', diagnosticos: [], signos: { taSis: '', taDia: '', peso: '', glucemia: '', hba1c: '' } })
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const setS = (k) => (e) => setF((x) => ({ ...x, signos: { ...x.signos, [k]: e.target.value } }))

  const guardar = async (e) => {
    e.preventDefault()
    if (!f.profesional.trim()) return setError('Indicá el profesional que registra.')
    if (!f.motivo.trim() && !f.evolucion.trim()) return setError('Completá el motivo o la evolución.')
    const num = (v) => (v === '' ? null : Number(String(v).replace(',', '.')))
    recordarProfesional(f.profesional.trim())
    await registrarEncuentro(pacienteId, {
      efectorId, tipo: f.tipo, profesional: f.profesional.trim(), motivo: f.motivo.trim(), evolucion: f.evolucion.trim(), indicaciones: f.indicaciones.trim(),
      diagnosticos: f.diagnosticos, signos: Object.fromEntries(Object.entries(f.signos).map(([k, v]) => [k, num(v)])),
    })
    onGuardado()
  }

  return (
    <form onSubmit={guardar} noValidate>
      <Tarjeta titulo="Nueva evolución">
        <div className="grilla-2">
          <Campo label="Tipo de atención">
            <select value={f.tipo} onChange={set('tipo')}>
              {Object.entries(TIPOS_ENCUENTRO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Campo>
          <Campo label="Profesional"><input value={f.profesional} onChange={set('profesional')} placeholder="Nombre y especialidad" /></Campo>
        </div>
        {f.tipo === 'teleconsulta' && <p className="nota">La teleconsulta queda registrada en la historia como cualquier consulta.</p>}
        <Campo label="Motivo de consulta"><input value={f.motivo} onChange={set('motivo')} /></Campo>
        <Campo label="Diagnóstico">
          <BuscadorCIE valor={f.diagnosticos} onCambiar={(l) => setF((x) => ({ ...x, diagnosticos: l }))} />
        </Campo>
        <Campo label="Evolución"><textarea rows={3} value={f.evolucion} onChange={set('evolucion')} /></Campo>
        <fieldset className="signos">
          <legend>Signos y laboratorio</legend>
          <label>TA sist.<input inputMode="numeric" value={f.signos.taSis} onChange={setS('taSis')} /></label>
          <label>TA diast.<input inputMode="numeric" value={f.signos.taDia} onChange={setS('taDia')} /></label>
          <label>Peso (kg)<input inputMode="decimal" value={f.signos.peso} onChange={setS('peso')} /></label>
          <label>Glucemia<input inputMode="numeric" value={f.signos.glucemia} onChange={setS('glucemia')} /></label>
          <label>HbA1c (%)<input inputMode="decimal" value={f.signos.hba1c} onChange={setS('hba1c')} /></label>
        </fieldset>
        <Campo label="Indicaciones"><textarea rows={2} value={f.indicaciones} onChange={set('indicaciones')} /></Campo>
        {error && <p className="campo-error">{error}</p>}
        <button className="btn btn-primario btn-grande">Guardar en la historia clínica</button>
      </Tarjeta>
    </form>
  )
}
