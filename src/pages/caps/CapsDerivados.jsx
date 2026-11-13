import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../AppContext.jsx'
import { db } from '../../lib/db.js'
import { fechaCorta, hoyISO, sumarDias } from '../../lib/fechas.js'
import { nombreCompleto } from '../../lib/pacientes.js'
import { EstadoBadge, Vacio, Cargando } from '../../components/Comunes.jsx'

const FILTROS = {
  accion: { label: 'Requieren acción', fn: (d) => necesitaAccion(d) },
  proximos: { label: 'Próximos turnos', fn: (d) => ['turno_asignado', 'confirmado'].includes(d.estado) },
  cerrados: { label: 'Con contrarreferencia', fn: (d) => d.estado === 'contrarreferido' },
  todos: { label: 'Todos', fn: () => true },
}

function necesitaAccion(d) {
  if (['pendiente_sync', 'sin_cupo', 'ausente'].includes(d.estado)) return true
  if (d.estado === 'turno_asignado' && (!d.aviso?.enviado || !d.aviso?.respuesta)) return true
  return false
}

function queHacer(d) {
  if (d.estado === 'pendiente_sync') return 'Se asigna turno al volver la señal'
  if (d.estado === 'sin_cupo') return 'Sin cupo: queda en espera'
  if (d.estado === 'ausente') return 'No fue: contactar al paciente'
  if (d.estado === 'turno_asignado' && !d.aviso?.enviado) return 'Avisar el turno al paciente'
  if (d.estado === 'turno_asignado') return 'Esperando confirmación'
  return null
}

export default function CapsDerivados() {
  const { perfil } = useApp()
  const [filtro, setFiltro] = useState('accion')
  const datos = useLiveQuery(async () => {
    const ders = await db.derivaciones.where('capsId').equals(perfil.efectorId).reverse().sortBy('creadaEn')
    const pacs = await db.pacientes.bulkGet([...new Set(ders.map((d) => d.pacienteId))])
    const porId = Object.fromEntries(pacs.filter(Boolean).map((p) => [p.id, p]))
    const controlesProximos = await db.controles
      .where('capsId').equals(perfil.efectorId)
      .filter((c) => c.estado === 'agendado' && c.fecha <= sumarDias(hoyISO(), 7))
      .count()
    return { ders, porId, controlesProximos }
  }, [perfil.efectorId])

  if (!datos) return <Cargando />
  const { ders, porId, controlesProximos } = datos
  const lista = ders.filter(FILTROS[filtro].fn)
  const cuenta = (k) => ders.filter(FILTROS[k].fn).length

  return (
    <>
      <div className="encabezado">
        <h1>Mis derivados</h1>
        <Link to="/caps/nueva" className="btn btn-primario">+ Nueva derivación</Link>
      </div>

      {controlesProximos > 0 && (
        <Link to="/caps/controles" className="banner-info">
          {controlesProximos} control{controlesProximos > 1 ? 'es' : ''} indicado{controlesProximos > 1 ? 's' : ''} por el hospital en los próximos 7 días →
        </Link>
      )}

      <div className="chips" role="tablist">
        {Object.entries(FILTROS).map(([k, f]) => (
          <button key={k} role="tab" aria-selected={filtro === k} className={`chip ${filtro === k ? 'activo' : ''}`} onClick={() => setFiltro(k)}>
            {f.label} <span className="chip-num">{cuenta(k)}</span>
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <Vacio>{filtro === 'accion' ? 'Nada pendiente. Todos los derivados tienen turno avisado.' : 'No hay derivaciones en esta lista.'}</Vacio>
      ) : (
        <ul className="lista">
          {lista.map((d) => {
            const p = porId[d.pacienteId]
            const tarea = queHacer(d)
            return (
              <li key={d.id}>
                <Link to={`/caps/derivacion/${d.id}`} className="item">
                  <div className="item-principal">
                    <strong>{nombreCompleto(p)}</strong>
                    <span className="item-sub">{d.especialidad} · DNI {p?.dni}</span>
                    {tarea && <span className="item-tarea">{tarea}</span>}
                  </div>
                  <div className="item-lateral">
                    <EstadoBadge estado={d.estado} />
                    {d.turnoFecha && <span className="item-fecha">{fechaCorta(d.turnoFecha)} {d.turnoHora}</span>}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
