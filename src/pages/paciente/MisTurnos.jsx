import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../AppContext.jsx'
import { db } from '../../lib/db.js'
import { fechaLarga, fechaCorta } from '../../lib/fechas.js'
import { registrarRespuesta } from '../../lib/circuito.js'
import { activarNotificaciones, archivoCalendario, avisarTurnosProximos, descargar, diasHasta, estadoParaPaciente, permisoNotificaciones } from '../../lib/ciudadano.js'
import { Tarjeta, Vacio, Cargando } from '../../components/Comunes.jsx'

const ACTIVOS = ['pendiente_sync', 'sin_cupo', 'turno_asignado', 'confirmado']

export default function MisTurnos() {
  const { perfil, notificar } = useApp()
  const [permiso, setPermiso] = useState(permisoNotificaciones())
  const [confirmando, setConfirmando] = useState(null) // { id, accion }

  const datos = useLiveQuery(async () => {
    const ders = await db.derivaciones.where('pacienteId').equals(perfil.pacienteId).toArray()
    const efs = await db.efectores.bulkGet([...new Set(ders.map((d) => d.hospitalId))])
    const hospitales = Object.fromEntries(efs.filter(Boolean).map((e) => [e.id, e]))
    const ordenar = (a, b) => (a.turnoFecha ?? '9999').localeCompare(b.turnoFecha ?? '9999')
    return {
      proximos: ders.filter((d) => ACTIVOS.includes(d.estado)).sort(ordenar),
      anteriores: ders.filter((d) => !ACTIVOS.includes(d.estado)).sort(ordenar).reverse(),
      hospitales,
    }
  }, [perfil.pacienteId])

  // Recordatorio al abrir la app para turnos de las próximas 48 h.
  useEffect(() => {
    if (datos && permiso === 'granted') avisarTurnosProximos(datos.proximos.filter((d) => d.turnoFecha), datos.hospitales)
  }, [datos?.proximos.length, permiso]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!datos) return <Cargando />
  const { proximos, anteriores, hospitales } = datos

  const activar = async () => {
    const p = await activarNotificaciones()
    setPermiso(p)
    if (p === 'granted') notificar('Listo: te vamos a recordar tus turnos.')
  }

  const responder = async (d, accion) => {
    await registrarRespuesta(d.id, accion, 'app')
    setConfirmando(null)
    notificar(
      accion === 'confirmado'
        ? '¡Gracias! Tu turno quedó confirmado.'
        : accion === 'reprogramar'
          ? 'Liberamos tu turno y te buscamos otro día.'
          : 'Cancelamos tu turno. Otra persona va a poder usarlo.',
    )
  }

  const calendario = (d) => {
    const h = hospitales[d.hospitalId]
    descargar(
      archivoCalendario({
        id: d.id,
        titulo: `Turno de ${d.especialidad}`,
        fecha: d.turnoFecha,
        hora: d.turnoHora,
        lugar: [h?.nombre, h?.calle, h?.partido].filter(Boolean).join(', '),
        descripcion: 'Llevá tu DNI y los estudios que tengas. Si no podés ir, avisá desde la app o en tu CAPS.',
      }),
      `turno-${d.especialidad.toLowerCase()}-${d.turnoFecha}.ics`,
    )
  }

  return (
    <>
      <div className="encabezado"><h1>Hola, {perfil.nombre}</h1></div>

      {permiso === 'default' && proximos.some((d) => d.turnoFecha) && (
        <div className="banner-info banner-accion">
          <span>¿Querés que te recordemos tus turnos?</span>
          <button className="btn btn-chico btn-primario" onClick={activar}>Activar recordatorios</button>
        </div>
      )}

      <Tarjeta titulo="Mis próximos turnos">
        {proximos.length === 0 ? (
          <Vacio>No tenés turnos pendientes. Si tu médico del CAPS te deriva, lo vas a ver acá.</Vacio>
        ) : (
          <ul className="lista">
            {proximos.map((d) => {
              const e = estadoParaPaciente(d)
              const h = hospitales[d.hospitalId]
              const dias = d.turnoFecha ? diasHasta(d.turnoFecha) : null
              return (
                <li key={d.id} className="turno-paciente">
                  <div className="turno-paciente-cabecera">
                    <span className={`badge badge-${e.tono}`}>{e.titulo}</span>
                    {dias != null && dias >= 0 && <span className="nota">{dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : `En ${dias} días`}</span>}
                  </div>
                  <strong className="turno-paciente-esp">{d.especialidad}</strong>
                  {d.turnoFecha ? (
                    <span className="turno-fecha">{fechaLarga(d.turnoFecha)} · {d.turnoHora} h</span>
                  ) : (
                    <span className="nota">{e.detalle}</span>
                  )}
                  {h && <span>{h.nombre}{h.calle ? ` · ${h.calle}` : ''} · {h.partido}</span>}
                  {d.turnoFecha && <span className="nota">{e.detalle}</span>}

                  {d.turnoFecha && (
                    <div className="botonera">
                      {d.estado === 'turno_asignado' && (
                        <button className="btn btn-ok" onClick={() => responder(d, 'confirmado')}>Confirmo que voy</button>
                      )}
                      <Link className="btn" to={`/navegar/${d.hospitalId}`}>Cómo llegar</Link>
                      <button className="btn" onClick={() => calendario(d)}>Agregar a mi calendario</button>
                    </div>
                  )}

                  {d.turnoFecha && (
                    confirmando?.id === d.id ? (
                      <div className="banner-alerta confirmar">
                        <span>{confirmando.accion === 'reprogramar' ? '¿Liberamos este turno y te buscamos otro día?' : '¿Cancelamos el turno? Otra persona podrá usarlo.'}</span>
                        <div className="botonera">
                          <button className="btn btn-chico btn-primario" onClick={() => responder(d, confirmando.accion)}>Sí</button>
                          <button className="btn btn-chico" onClick={() => setConfirmando(null)}>No</button>
                        </div>
                      </div>
                    ) : (
                      <div className="botonera">
                        <button className="btn-link" onClick={() => setConfirmando({ id: d.id, accion: 'reprogramar' })}>Necesito otro día</button>
                        <button className="btn-link texto-error" onClick={() => setConfirmando({ id: d.id, accion: 'cancelado' })}>No puedo ir</button>
                      </div>
                    )
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Tarjeta>

      {anteriores.length > 0 && (
        <Tarjeta titulo="Turnos anteriores">
          <ul className="lista">
            {anteriores.map((d) => {
              const e = estadoParaPaciente(d)
              return (
                <li key={d.id} className="item item-estatico">
                  <div className="item-principal">
                    <strong>{d.especialidad}</strong>
                    <span className="item-sub">{d.turnoFecha ? fechaCorta(d.turnoFecha) : '—'} · {hospitales[d.hospitalId]?.nombre}</span>
                  </div>
                  <div className="item-lateral"><span className={`badge badge-${e.tono}`}>{e.titulo}</span></div>
                </li>
              )
            })}
          </ul>
          <Link to="/paciente/salud" className="btn-link">Ver las indicaciones del especialista →</Link>
        </Tarjeta>
      )}
    </>
  )
}
