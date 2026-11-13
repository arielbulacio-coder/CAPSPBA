import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../AppContext.jsx'
import { db } from '../../lib/db.js'
import { fechaCorta, habil, hoyISO, sumarDias, difDias, edad } from '../../lib/fechas.js'
import { nombreCompleto } from '../../lib/pacientes.js'
import { registrarControlRealizado, registrarControlSinAgenda } from '../../lib/circuito.js'
import { agendarSolicitud } from '../../lib/ciudadano.js'
import { Tarjeta, Vacio, Cargando } from '../../components/Comunes.jsx'

// Seguimiento de crónicos en el primer nivel (Meta 2: diabéticos con control 45% → 60%).
export default function Controles() {
  const { perfil, notificar } = useApp()
  const [soloSinControl, setSoloSinControl] = useState(true)
  const [fechas, setFechas] = useState({})
  const datos = useLiveQuery(async () => {
    const [solicitudes, controles, pacientes] = await Promise.all([
      db.controles.where('capsId').equals(perfil.efectorId).filter((c) => c.estado === 'solicitado').sortBy('solicitadoEn'),
      db.controles.where('capsId').equals(perfil.efectorId).filter((c) => c.estado === 'agendado').sortBy('fecha'),
      db.pacientes.where('capsId').equals(perfil.efectorId).toArray(),
    ])
    return { solicitudes, controles, pacientes, porId: Object.fromEntries(pacientes.map((p) => [p.id, p])) }
  }, [perfil.efectorId])

  if (!datos) return <Cargando />
  const { solicitudes, controles, pacientes, porId } = datos
  const hoy = hoyISO()
  const hace12m = sumarDias(hoy, -365)

  const cronicos = pacientes
    .filter((p) => p.cronico?.length)
    .map((p) => ({ ...p, alDia: p.ultimoControl && p.ultimoControl >= hace12m }))
    .sort((a, b) => (a.ultimoControl ?? '').localeCompare(b.ultimoControl ?? ''))
  const dbt = cronicos.filter((p) => p.cronico.includes('DBT'))
  const pctDbt = dbt.length ? Math.round((dbt.filter((p) => p.alDia).length / dbt.length) * 100) : 0
  const visibles = soloSinControl ? cronicos.filter((p) => !p.alDia) : cronicos

  const realizado = async (c) => {
    await registrarControlRealizado(c.id)
    notificar('Control registrado.')
  }
  const controlHoy = async (p) => {
    await registrarControlSinAgenda(p.id)
    notificar(`Control de ${p.nombre} registrado hoy.`)
  }

  return (
    <>
      <div className="encabezado"><h1>Crónicos y controles</h1></div>

      {solicitudes.length > 0 && (
        <Tarjeta titulo={`Pedidos de pacientes desde la app (${solicitudes.length})`} className="tarjeta-alerta">
          <ul className="lista">
            {solicitudes.map((c) => {
              const p = porId[c.pacienteId]
              const f = fechas[c.id] ?? habil(sumarDias(hoy, 2))
              return (
                <li key={c.id} className="item item-estatico item-solicitud">
                  <div className="item-principal">
                    <strong>{nombreCompleto(p)}</strong>
                    <span className="item-sub">{c.motivo} · prefiere {c.preferencia}</span>
                  </div>
                  <div className="fila-agendar">
                    <input type="date" min={hoy} value={f} onChange={(e) => setFechas((x) => ({ ...x, [c.id]: e.target.value }))} aria-label="Fecha del control" />
                    <button className="btn btn-chico btn-primario" onClick={async () => { await agendarSolicitud(c.id, f); notificar(`Control agendado. ${p?.nombre ?? 'El paciente'} lo ve en la app.`) }}>Agendar</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Tarjeta>
      )}

      <Tarjeta titulo="Controles agendados">
        {controles.length === 0 ? (
          <Vacio>No hay controles agendados por contrarreferencia.</Vacio>
        ) : (
          <ul className="lista">
            {controles.map((c) => {
              const p = porId[c.pacienteId]
              const atraso = Math.floor(difDias(c.fecha, hoy))
              return (
                <li key={c.id} className="item item-estatico">
                  <div className="item-principal">
                    <strong>{nombreCompleto(p)}</strong>
                    <span className="item-sub">{c.motivo}</span>
                    {atraso > 0 && <span className="item-tarea">Vencido hace {atraso} día{atraso > 1 ? 's' : ''}</span>}
                  </div>
                  <div className="item-lateral">
                    <span className="item-fecha">{fechaCorta(c.fecha)}</span>
                    <button className="btn btn-chico" onClick={() => realizado(c)}>Hecho</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Pacientes crónicos"
        accion={
          <label className="interruptor">
            <input type="checkbox" checked={soloSinControl} onChange={(e) => setSoloSinControl(e.target.checked)} />
            <span>Sólo sin control en 12 meses</span>
          </label>
        }
      >
        <p className="nota">Diabéticos de este CAPS con control en los últimos 12 meses: <strong>{pctDbt}%</strong> (meta provincial: 60%).</p>
        {visibles.length === 0 ? (
          <Vacio>Todos los crónicos tienen su control al día.</Vacio>
        ) : (
          <ul className="lista">
            {visibles.map((p) => (
              <li key={p.id} className="item item-estatico">
                <div className="item-principal">
                  <strong>{nombreCompleto(p)}</strong>
                  <span className="item-sub">{edad(p.fechaNac)} años · {p.cronico.join(' + ')}{p.telefono ? ` · ${p.telefono}` : ''}</span>
                  <span className={p.alDia ? 'item-sub' : 'item-tarea'}>
                    {p.ultimoControl ? `Último control: ${fechaCorta(p.ultimoControl)}` : 'Sin control registrado'}
                  </span>
                </div>
                <div className="item-lateral">
                  <button className="btn btn-chico" onClick={() => controlHoy(p)}>Control hoy</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  )
}
