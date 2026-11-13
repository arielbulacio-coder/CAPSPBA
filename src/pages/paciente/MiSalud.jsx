import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../AppContext.jsx'
import { db, CANALES } from '../../lib/db.js'
import { aISO, fechaLarga, fechaCorta, hoyISO, sumarDias } from '../../lib/fechas.js'
import { cambiarCanal, solicitarControl } from '../../lib/ciudadano.js'
import { Campo, Tarjeta, Vacio, Cargando } from '../../components/Comunes.jsx'

const MOTIVOS = ['Control de diabetes', 'Control de presión', 'Renovar recetas', 'Control general', 'Otro']

export default function MiSalud() {
  const { perfil, notificar } = useApp()
  const [pedido, setPedido] = useState({ motivo: MOTIVOS[0], detalle: '', preferencia: 'mañana' })
  const [abierto, setAbierto] = useState(false)

  const datos = useLiveQuery(async () => {
    const [p, caps, controles, ders] = await Promise.all([
      db.pacientes.get(perfil.pacienteId),
      db.efectores.get(perfil.efectorId),
      db.controles.where('pacienteId').equals(perfil.pacienteId).toArray(),
      db.derivaciones.where('pacienteId').equals(perfil.pacienteId).filter((d) => !!d.contrarreferencia).toArray(),
    ])
    return { p, caps, controles, ders }
  }, [perfil.pacienteId, perfil.efectorId])
  const [canal, setCanal] = useState(null)
  const [telefono, setTelefono] = useState(null)

  if (!datos) return <Cargando />
  const { p, caps, controles, ders } = datos
  const canalActual = canal ?? p.canal
  const telActual = telefono ?? p.telefono ?? ''

  const pendientes = controles.filter((c) => c.estado === 'solicitado')
  const agendados = controles.filter((c) => c.estado === 'agendado').sort((a, b) => a.fecha.localeCompare(b.fecha))
  const ultimoControl = p.ultimoControl
  const necesitaControl = p.cronico?.length && (!ultimoControl || ultimoControl < sumarDias(hoyISO(), -365))

  const pedir = async (e) => {
    e.preventDefault()
    const motivo = pedido.motivo === 'Otro' ? pedido.detalle : `${pedido.motivo}${pedido.detalle ? `: ${pedido.detalle}` : ''}`
    await solicitarControl(p, { motivo, preferencia: pedido.preferencia })
    setAbierto(false)
    setPedido({ motivo: MOTIVOS[0], detalle: '', preferencia: 'mañana' })
    notificar(`Tu pedido llegó a ${caps?.nombre ?? 'tu CAPS'}. Te avisamos el día.`)
  }

  const guardarCanal = async () => {
    await cambiarCanal(p.id, canalActual, telActual.trim())
    notificar('Guardamos cómo querés que te avisemos.')
  }

  return (
    <>
      <div className="encabezado"><h1>Mi salud</h1></div>

      {necesitaControl && (
        <div className="banner-alerta banner-accion">
          <span>Hace más de un año que no tenés un control registrado. Pedilo en tu CAPS: es la mejor forma de evitar una internación.</span>
          <button className="btn btn-chico btn-primario" onClick={() => setAbierto(true)}>Pedir control</button>
        </div>
      )}

      {caps && (
        <Tarjeta titulo="Mi CAPS">
          <strong>{caps.nombre}</strong>
          <span className="nota">{caps.calle ? `${caps.calle} · ` : ''}{caps.partido}</span>
          <div className="botonera">
            <Link className="btn" to={`/navegar/${caps.id}`}>Cómo llegar</Link>
            <Link className="btn" to="/cerca">Otros CAPS cerca</Link>
          </div>
        </Tarjeta>
      )}

      <Tarjeta titulo="Mis próximos controles en el CAPS" accion={!abierto && <button className="btn btn-chico btn-primario" onClick={() => setAbierto(true)}>Pedir control</button>}>
        {abierto && (
          <form onSubmit={pedir} className="pedido-control">
            <Campo label="¿Para qué?">
              <select value={pedido.motivo} onChange={(e) => setPedido((x) => ({ ...x, motivo: e.target.value }))}>
                {MOTIVOS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Campo>
            <Campo label={pedido.motivo === 'Otro' ? 'Contanos el motivo' : 'Algo más que quieras contar (opcional)'}>
              <input value={pedido.detalle} onChange={(e) => setPedido((x) => ({ ...x, detalle: e.target.value }))} />
            </Campo>
            <Campo label="¿Qué horario te queda mejor?">
              <select value={pedido.preferencia} onChange={(e) => setPedido((x) => ({ ...x, preferencia: e.target.value }))}>
                <option value="mañana">Mañana</option>
                <option value="tarde">Tarde</option>
                <option value="indistinto">Me da igual</option>
              </select>
            </Campo>
            <div className="botonera">
              <button className="btn btn-primario" disabled={pedido.motivo === 'Otro' && !pedido.detalle.trim()}>Enviar pedido</button>
              <button type="button" className="btn" onClick={() => setAbierto(false)}>Cancelar</button>
            </div>
          </form>
        )}

        {agendados.length === 0 && pendientes.length === 0 && !abierto && <Vacio>No tenés controles agendados.</Vacio>}
        <ul className="lista">
          {agendados.map((c) => (
            <li key={c.id} className="item item-estatico">
              <div className="item-principal">
                <strong className="primera-mayus">{fechaLarga(c.fecha)}</strong>
                <span className="item-sub">{c.motivo}</span>
              </div>
              <div className="item-lateral"><span className="badge badge-ok">Agendado</span></div>
            </li>
          ))}
          {pendientes.map((c) => (
            <li key={c.id} className="item item-estatico">
              <div className="item-principal">
                <strong>{c.motivo}</strong>
                <span className="item-sub">Pedido el {fechaCorta(aISO(new Date(c.solicitadoEn)))} · horario: {c.preferencia}</span>
              </div>
              <div className="item-lateral"><span className="badge badge-alerta">Esperando día</span></div>
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Indicaciones del especialista">
        {ders.length === 0 ? (
          <Vacio>Cuando un especialista te atienda, vas a ver acá lo que le indicó a tu CAPS.</Vacio>
        ) : (
          <ul className="lista">
            {ders.sort((a, b) => b.contrarreferencia.fecha - a.contrarreferencia.fecha).map((d) => (
              <li key={d.id} className="item item-estatico indicacion">
                <div className="item-principal">
                  <strong>{d.especialidad} · {fechaCorta(d.turnoFecha)}</strong>
                  <span>{d.contrarreferencia.indicacion}</span>
                  <span className="item-sub">Próximo control en tu CAPS: {fechaLarga(d.contrarreferencia.proximoControl)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="nota">Ante cualquier duda sobre la medicación, consultá en tu CAPS. No cambies el tratamiento por tu cuenta.</p>
      </Tarjeta>

      <Tarjeta titulo="¿Cómo querés que te avisemos?">
        <div className="opciones-canal" role="radiogroup" aria-label="Canal de aviso">
          {Object.entries(CANALES).map(([k, v]) => (
            <label key={k} className={`chip ${canalActual === k ? 'activo' : ''}`}>
              <input type="radio" name="canal" value={k} checked={canalActual === k} onChange={() => setCanal(k)} className="oculto" />
              {v}
            </label>
          ))}
        </div>
        {canalActual !== 'papel' && canalActual !== 'app' && (
          <Campo label="Teléfono (tuyo o de un familiar)">
            <input inputMode="tel" value={telActual} onChange={(e) => setTelefono(e.target.value)} placeholder="Ej.: 2364551234" />
          </Campo>
        )}
        <button className="btn" onClick={guardarCanal} disabled={canalActual === p.canal && telActual === (p.telefono ?? '')}>Guardar</button>
      </Tarjeta>
    </>
  )
}
