import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../AppContext.jsx'
import { db } from '../../lib/db.js'
import { fechaCorta, fechaHora } from '../../lib/fechas.js'
import { obtenerHistoria, pacientePrincipal } from '../../lib/hcu.js'
import { Tarjeta, Vacio, Cargando } from '../../components/Comunes.jsx'
import { LineaDeTiempo } from '../hcu/HistoriaClinica.jsx'

const ROLES = { caps: 'Equipo del CAPS', hospital: 'Equipo del hospital', gestion: 'Gestión' }

// Derecho de acceso a la propia historia clínica (Ley 26.529) y a saber quién la consultó.
export default function MiHistoria() {
  const { perfil } = useApp()
  const datos = useLiveQuery(async () => {
    const p = await pacientePrincipal(perfil.pacienteId)
    const [h, accesos] = await Promise.all([obtenerHistoria(p.id), db.accesos.where('pacienteId').equals(p.id).reverse().sortBy('fecha')])
    return { h, accesos }
  }, [perfil.pacienteId])
  if (!datos) return <Cargando />
  const { h, accesos } = datos
  const p = h.paciente

  return (
    <>
      <div className="encabezado"><h1>Mi historia clínica</h1></div>
      <p className="nota">La misma historia que ven los equipos de salud de la red pública de la provincia.</p>

      <div className={`hc-alergias ${p.alergias?.length ? 'con-alergias' : ''}`}>
        <span><strong>Alergias:</strong> {p.alergias?.length ? p.alergias.join(', ') : 'No registra'}</span>
      </div>

      <Tarjeta titulo="Mis problemas de salud">
        {h.problemas.filter((x) => x.estado === 'activo').length === 0 ? <Vacio>No hay problemas registrados.</Vacio> : (
          <ul className="lista-simple">
            {h.problemas.filter((x) => x.estado === 'activo').map((x) => <li key={x.id}>{x.texto} <span className="nota">desde {fechaCorta(x.desde)}</span></li>)}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="Mi medicación">
        {h.medicacion.filter((m) => m.activa).length === 0 ? <Vacio>No hay medicación registrada.</Vacio> : (
          <ul className="lista-simple">
            {h.medicacion.filter((m) => m.activa).map((m) => <li key={m.id}><strong>{m.droga}</strong> — {m.dosis}</li>)}
          </ul>
        )}
        <p className="nota">No cambies ni suspendas la medicación sin consultar en tu CAPS.</p>
      </Tarjeta>

      <Tarjeta titulo="Mis atenciones">
        <LineaDeTiempo items={h.linea.slice(0, 15)} paraPaciente />
      </Tarjeta>

      <Tarjeta titulo="Quién consultó mi historia">
        {accesos.length === 0 ? <Vacio>Nadie consultó tu historia todavía.</Vacio> : (
          <ul className="lista-simple">
            {accesos.slice(0, 20).map((a) => <li key={a.id}>{ROLES[a.rol] ?? a.rol}{a.efector ? ` · ${a.efector}` : ''} <span className="nota">· {fechaHora(a.fecha)}</span></li>)}
          </ul>
        )}
        <p className="nota">Si ves un acceso que no reconocés, avisá en tu CAPS.</p>
      </Tarjeta>
    </>
  )
}
