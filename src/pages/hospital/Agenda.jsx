import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../AppContext.jsx'
import { db, ESPECIALIDADES } from '../../lib/db.js'
import { fechaLarga, hoyISO } from '../../lib/fechas.js'
import { nombreCompleto } from '../../lib/pacientes.js'
import { EstadoBadge, Tarjeta, Vacio, Cargando } from '../../components/Comunes.jsx'

const ACTIVOS = ['turno_asignado', 'confirmado', 'atendido']

export default function Agenda() {
  const { perfil } = useApp()
  const [esp, setEsp] = useState('Cardiología')
  const datos = useLiveQuery(async () => {
    const ders = await db.derivaciones.where('hospitalId').equals(perfil.efectorId).filter((d) => !!d.turnoFecha).toArray()
    const ids = [...new Set(ders.flatMap((d) => [d.pacienteId, d.capsId]))]
    const [pacs, efs] = await Promise.all([db.pacientes.bulkGet(ids), db.efectores.bulkGet(ids)])
    const porId = Object.fromEntries([...pacs, ...efs].filter(Boolean).map((x) => [x.id, x]))
    return { ders, porId }
  }, [perfil.efectorId])

  if (!datos) return <Cargando />
  const { ders, porId } = datos
  const hoy = hoyISO()
  const deEsp = ders.filter((d) => d.especialidad === esp)

  // Atendidos sin contrarreferencia: el circuito queda abierto hasta que se completa.
  const sinCerrar = deEsp.filter((d) => d.estado === 'atendido' || (d.turnoFecha < hoy && ['turno_asignado', 'confirmado'].includes(d.estado)))
  const proximos = deEsp
    .filter((d) => d.turnoFecha >= hoy && ACTIVOS.includes(d.estado))
    .sort((a, b) => (a.turnoFecha + a.turnoHora).localeCompare(b.turnoFecha + b.turnoHora))

  const porDia = proximos.reduce((acc, d) => {
    ;(acc[d.turnoFecha] ??= []).push(d)
    return acc
  }, {})

  const Fila = ({ d }) => {
    const p = porId[d.pacienteId]
    return (
      <li>
        <Link to={`/hospital/atencion/${d.id}`} className="item">
          <span className="item-hora">{d.turnoHora}</span>
          <div className="item-principal">
            <strong>{nombreCompleto(p)}</strong>
            <span className="item-sub">{porId[d.capsId]?.nombre} · {d.motivo}</span>
          </div>
          <div className="item-lateral"><EstadoBadge estado={d.estado} /></div>
        </Link>
      </li>
    )
  }

  return (
    <>
      <div className="encabezado">
        <h1>Derivaciones de CAPS</h1>
        <select value={esp} onChange={(e) => setEsp(e.target.value)} aria-label="Especialidad">
          {ESPECIALIDADES.map((e) => <option key={e}>{e}</option>)}
        </select>
      </div>

      {sinCerrar.length > 0 && (
        <Tarjeta titulo={`Falta contrarreferencia (${sinCerrar.length})`} className="tarjeta-alerta">
          <p className="nota">Tres campos y el CAPS sabe qué hacer. El circuito no se cierra sin esto.</p>
          <ul className="lista">{sinCerrar.map((d) => <Fila key={d.id} d={d} />)}</ul>
        </Tarjeta>
      )}

      {Object.keys(porDia).length === 0 ? (
        <Vacio>No hay turnos de {esp} derivados desde CAPS.</Vacio>
      ) : (
        Object.entries(porDia).map(([fecha, lista]) => (
          <Tarjeta key={fecha} titulo={fecha === hoy ? `Hoy · ${fechaLarga(fecha)}` : fechaLarga(fecha)}>
            <ul className="lista">{lista.map((d) => <Fila key={d.id} d={d} />)}</ul>
          </Tarjeta>
        ))
      )}
    </>
  )
}
