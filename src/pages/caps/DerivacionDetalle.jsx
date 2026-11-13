import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../AppContext.jsx'
import { db, CANALES } from '../../lib/db.js'
import { fechaLarga, fechaHora, edad } from '../../lib/fechas.js'
import { nombreCompleto } from '../../lib/pacientes.js'
import { textoAviso, enlaceCanal } from '../../lib/mensajes.js'
import { marcarAvisoEnviado, registrarRespuesta } from '../../lib/circuito.js'
import { EstadoBadge, Tarjeta, Cargando } from '../../components/Comunes.jsx'

const PASOS = [
  ['creada', 'Derivada'],
  ['turno', 'Turno asignado'],
  ['aviso', 'Paciente avisado'],
  ['confirmado', 'Confirmó'],
  ['atendido', 'Atendido'],
  ['contra', 'Contrarreferencia'],
]

function pasoActual(d) {
  if (d.estado === 'contrarreferido') return 5
  if (d.estado === 'atendido') return 4
  if (d.estado === 'confirmado') return 3
  if (d.aviso?.enviado && d.turnoId) return 2
  if (d.turnoId) return 1
  return 0
}

export default function DerivacionDetalle() {
  const { id } = useParams()
  const { notificar } = useApp()
  const datos = useLiveQuery(async () => {
    const d = await db.derivaciones.get(id)
    if (!d) return { d: null }
    const [p, hospital, caps] = await Promise.all([db.pacientes.get(d.pacienteId), db.efectores.get(d.hospitalId), db.efectores.get(d.capsId)])
    return { d, p, hospital, caps }
  }, [id])

  if (!datos) return <Cargando />
  const { d, p, hospital, caps } = datos
  if (!d) return <p className="vacio">No se encontró la derivación. <Link to="/caps">Volver</Link></p>

  const paso = pasoActual(d)
  const texto = d.turnoId ? textoAviso({ paciente: p, derivacion: d, hospital, caps }) : ''
  const enlace = d.turnoId ? enlaceCanal(d.aviso.canal, p.telefono, texto) : null

  const enviarAviso = async () => {
    if (d.aviso.canal === 'papel') window.print()
    else if (enlace) window.open(enlace, '_blank', 'noopener')
    await marcarAvisoEnviado(d.id)
  }

  const responder = async (r) => {
    await registrarRespuesta(d.id, r)
    notificar(r === 'confirmado' ? 'Turno confirmado.' : r === 'reprogramar' ? 'Turno liberado al cupo. Se buscó el siguiente disponible.' : 'Turno cancelado y devuelto al cupo.')
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      notificar('Mensaje copiado.')
    } catch {
      notificar('No se pudo copiar.')
    }
  }

  return (
    <>
      <div className="encabezado no-print">
        <Link to="/caps" className="btn-link">← Mis derivados</Link>
      </div>

      <div className="no-print">
        <div className="encabezado">
          <div>
            <h1>{nombreCompleto(p)}</h1>
            <p className="nota">DNI {p.dni} · {edad(p.fechaNac)} años{p.cronico?.length ? ` · ${p.cronico.join(' + ')}` : ''}</p>
          </div>
          <EstadoBadge estado={d.estado} />
        </div>

        <ol className="pasos" aria-label="Recorrido de la derivación">
          {PASOS.map(([k, label], i) => (
            <li key={k} className={i <= paso && !['ausente', 'cancelado'].includes(d.estado) ? 'hecho' : ''}>{label}</li>
          ))}
        </ol>

        <Tarjeta titulo="Turno">
          {d.estado === 'pendiente_sync' && <p>Guardada sin conexión el {fechaHora(d.creadaEn)}. El turno se asigna automáticamente contra el cupo protegido cuando vuelva la señal.</p>}
          {d.estado === 'sin_cupo' && <p>No quedan cupos protegidos de {d.especialidad} en las próximas semanas. Queda primera en la lista y se asigna en cuanto se libere uno.</p>}
          {d.turnoId && (
            <div className="turno">
              <span className="turno-fecha">{fechaLarga(d.turnoFecha)} · {d.turnoHora} h</span>
              <span>{d.especialidad} · {hospital.nombre}</span>
              <span className="nota">Asignado {fechaHora(d.asignadaEn)} (derivada {fechaHora(d.creadaEn)})</span>
            </div>
          )}
          {d.estado === 'ausente' && <p className="banner-alerta">El paciente no asistió. Conviene contactarlo y, si corresponde, derivar de nuevo.</p>}
        </Tarjeta>

        {d.turnoId && ['turno_asignado', 'confirmado'].includes(d.estado) && (
          <Tarjeta titulo={`Aviso al paciente · ${CANALES[d.aviso.canal]}`}>
            <blockquote className="mensaje">{texto}</blockquote>
            <div className="botonera">
              <button className="btn btn-primario" onClick={enviarAviso}>
                {d.aviso.canal === 'papel' ? 'Imprimir comprobante' : d.aviso.canal === 'llamada' ? 'Llamar' : `Enviar por ${CANALES[d.aviso.canal]}`}
              </button>
              {d.aviso.canal !== 'papel' && <button className="btn" onClick={copiar}>Copiar mensaje</button>}
              {d.aviso.canal !== 'papel' && <button className="btn" onClick={() => window.print()}>Imprimir comprobante</button>}
            </div>
            {d.aviso.canal !== 'papel' && !p.telefono && <p className="campo-error">El paciente no tiene teléfono cargado: entregale el comprobante impreso.</p>}
            {d.aviso.enviado && d.estado === 'turno_asignado' && (
              <>
                <p className="nota">Aviso enviado. ¿Qué respondió?</p>
                <div className="botonera">
                  <button className="btn btn-ok" onClick={() => responder('confirmado')}>Confirmó</button>
                  <button className="btn" onClick={() => responder('reprogramar')}>Pide otro día</button>
                  <button className="btn btn-peligro" onClick={() => responder('cancelado')}>No va a ir</button>
                </div>
              </>
            )}
            {d.estado === 'confirmado' && (
              <div className="botonera">
                <button className="btn" onClick={() => responder('reprogramar')}>Reprogramar</button>
                <button className="btn btn-peligro" onClick={() => responder('cancelado')}>Cancelar turno</button>
              </div>
            )}
          </Tarjeta>
        )}

        {d.contrarreferencia && (
          <Tarjeta titulo="Contrarreferencia del hospital" className="tarjeta-ok">
            <dl className="dl">
              <dt>Diagnóstico</dt><dd>{d.contrarreferencia.diagnostico}</dd>
              <dt>Indicación</dt><dd>{d.contrarreferencia.indicacion}</dd>
              <dt>Próximo control en el CAPS</dt><dd>{fechaLarga(d.contrarreferencia.proximoControl)}</dd>
            </dl>
            <p className="nota">{d.contrarreferencia.profesional} · {fechaHora(d.contrarreferencia.fecha)}</p>
            <Link to="/caps/controles" className="btn-link">Ver controles agendados →</Link>
          </Tarjeta>
        )}

        <Tarjeta titulo="Lo que recibe el especialista">
          <dl className="dl">
            <dt>Especialidad</dt><dd>{d.especialidad}{d.prioridad === 'preferente' ? ' · preferente' : ''}</dd>
            <dt>Motivo</dt><dd>{d.motivo}</dd>
            <dt>Antecedentes</dt><dd>{d.antecedentes || '—'}</dd>
            <dt>Estudios</dt><dd>{d.estudios || '—'}</dd>
          </dl>
        </Tarjeta>
      </div>

      {d.turnoId && (
        <div className="solo-print comprobante">
          <h1>Turno de {d.especialidad}</h1>
          <p className="comprobante-nombre">{p.nombre} {p.apellido} — DNI {p.dni}</p>
          <p className="comprobante-fecha">{fechaLarga(d.turnoFecha)}<br />{d.turnoHora} h</p>
          <p>{hospital.nombre}</p>
          <p>Llevá tu DNI y los estudios que tengas.</p>
          <p>Si no podés ir, avisá en el {caps.nombre} así el turno lo usa otra persona.</p>
        </div>
      )}
    </>
  )
}
