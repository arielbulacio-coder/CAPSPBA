import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../AppContext.jsx'
import { db } from '../../lib/db.js'
import { fechaLarga, fechaCorta, fechaHora, edad, habil, hoyISO, sumarDias } from '../../lib/fechas.js'
import { nombreCompleto } from '../../lib/pacientes.js'
import { marcarAusente, marcarAtendido, registrarContrarreferencia } from '../../lib/circuito.js'
import { Campo, EstadoBadge, Tarjeta, Cargando } from '../../components/Comunes.jsx'
import BuscadorCIE from '../../components/BuscadorCIE.jsx'

const PLAZOS = [30, 60, 90, 180]

export default function Atencion() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { notificar } = useApp()
  const [cr, setCr] = useState({ diagnostico: '', indicacion: '', proximoControl: habil(sumarDias(hoyISO(), 90)), profesional: 'Dr. Martín Acosta' })
  const [errores, setErrores] = useState({})

  const datos = useLiveQuery(async () => {
    const d = await db.derivaciones.get(id)
    if (!d) return { d: null }
    const [p, caps, previas] = await Promise.all([
      db.pacientes.get(d.pacienteId),
      db.efectores.get(d.capsId),
      db.derivaciones.where('pacienteId').equals(d.pacienteId).filter((x) => x.id !== d.id && !!x.contrarreferencia).toArray(),
    ])
    return { d, p, caps, previas }
  }, [id])

  if (!datos) return <Cargando />
  const { d, p, caps, previas } = datos
  if (!d) return <p className="vacio">No se encontró. <Link to="/hospital">Volver</Link></p>

  const set = (k) => (e) => setCr((c) => ({ ...c, [k]: e.target.value }))
  const puedeCerrar = ['turno_asignado', 'confirmado', 'atendido'].includes(d.estado)

  const guardar = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!cr.diagnostico.trim()) errs.diagnostico = 'Falta el diagnóstico.'
    if (!cr.indicacion.trim()) errs.indicacion = 'Falta la indicación.'
    if (!cr.proximoControl) errs.proximoControl = 'Falta la fecha del próximo control.'
    setErrores(errs)
    if (Object.keys(errs).length) return
    await registrarContrarreferencia(d.id, { ...cr, diagnostico: cr.diagnostico.trim(), indicacion: cr.indicacion.trim() })
    notificar(`Contrarreferencia enviada. Control agendado en ${caps.nombre}.`)
    navigate('/hospital')
  }

  return (
    <>
      <div className="encabezado"><Link to="/hospital" className="btn-link">← Agenda</Link></div>

      <div className="encabezado">
        <div>
          <h1>{nombreCompleto(p)}</h1>
          <p className="nota">DNI {p.dni} · {edad(p.fechaNac)} años · {caps.nombre}</p>
          <Link to={`/hospital/hcu/${p.id}`} className="btn-link">Ver historia clínica completa →</Link>
        </div>
        <EstadoBadge estado={d.estado} />
      </div>

      <Tarjeta titulo={`${d.especialidad} · ${fechaLarga(d.turnoFecha)} ${d.turnoHora} h`}>
        <dl className="dl">
          <dt>Motivo</dt><dd>{d.motivo}</dd>
          <dt>Antecedentes</dt><dd>{d.antecedentes || '—'}</dd>
          <dt>Estudios</dt><dd>{d.estudios || '—'}</dd>
          <dt>Crónico</dt><dd>{p.cronico?.length ? p.cronico.join(' + ') : 'No'}</dd>
          <dt>Último control en CAPS</dt><dd>{p.ultimoControl ? fechaCorta(p.ultimoControl) : 'Sin registro'}</dd>
        </dl>
        <p className="nota">Derivado {fechaHora(d.creadaEn)}{d.prioridad === 'preferente' ? ' · prioridad preferente' : ''}</p>
      </Tarjeta>

      {previas.length > 0 && (
        <Tarjeta titulo="Contrarreferencias anteriores">
          <ul className="lista">
            {previas.map((x) => (
              <li key={x.id} className="item item-estatico">
                <div className="item-principal">
                  <strong>{x.especialidad} · {fechaCorta(x.turnoFecha)}</strong>
                  <span className="item-sub">{x.contrarreferencia.diagnostico} — {x.contrarreferencia.indicacion}</span>
                </div>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {d.contrarreferencia && (
        <Tarjeta titulo="Contrarreferencia enviada" className="tarjeta-ok">
          <dl className="dl">
            <dt>Diagnóstico</dt><dd>{d.contrarreferencia.diagnostico}</dd>
            <dt>Indicación</dt><dd>{d.contrarreferencia.indicacion}</dd>
            <dt>Próximo control</dt><dd>{fechaLarga(d.contrarreferencia.proximoControl)}</dd>
          </dl>
        </Tarjeta>
      )}

      {puedeCerrar && (
        <form onSubmit={guardar} noValidate>
          <Tarjeta titulo="Contrarreferencia al CAPS">
            <Campo label="1. Diagnóstico" error={errores.diagnostico}>
              <BuscadorCIE
                valor={cr.codigo ? [{ codigo: cr.codigo, texto: cr.diagnostico }] : []}
                onCambiar={(l) => setCr((c) => ({ ...c, codigo: l[0]?.codigo ?? null, diagnostico: l[0]?.texto ?? c.diagnostico }))}
                multiple={false}
                placeholder="Codificar con CIE-10 (opcional)"
              />
              <input value={cr.diagnostico} onChange={set('diagnostico')} placeholder="Ej.: HTA estadio 1, ECG normal" aria-label="Diagnóstico" />
            </Campo>
            <Campo label="2. Indicación para el CAPS" error={errores.indicacion}>
              <textarea rows={2} value={cr.indicacion} onChange={set('indicacion')} placeholder="Medicación, controles, qué vigilar" />
            </Campo>
            <Campo label="3. Próximo control en el CAPS" error={errores.proximoControl}>
              <div className="fila-plazos">
                {PLAZOS.map((dias) => {
                  const f = habil(sumarDias(hoyISO(), dias))
                  return (
                    <button type="button" key={dias} className={`chip ${cr.proximoControl === f ? 'activo' : ''}`} onClick={() => setCr((c) => ({ ...c, proximoControl: f }))}>
                      {dias} días
                    </button>
                  )
                })}
                <input type="date" value={cr.proximoControl} onChange={set('proximoControl')} aria-label="Fecha del próximo control" />
              </div>
            </Campo>
            <div className="botonera">
              <button type="submit" className="btn btn-primario">Enviar contrarreferencia</button>
              {d.estado !== 'atendido' && (
                <>
                  <button type="button" className="btn" onClick={() => marcarAtendido(d.id)}>Atendido, completo después</button>
                  <button type="button" className="btn btn-peligro" onClick={async () => { await marcarAusente(d.id); notificar('Marcado ausente. El CAPS recibe el aviso.'); navigate('/hospital') }}>
                    No vino
                  </button>
                </>
              )}
            </div>
          </Tarjeta>
        </form>
      )}
    </>
  )
}
