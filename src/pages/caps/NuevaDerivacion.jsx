import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../AppContext.jsx'
import { db, ESPECIALIDADES, CANALES, nuevoId } from '../../lib/db.js'
import { validarDNI, buscarPosiblesDuplicados, nombreCompleto } from '../../lib/pacientes.js'
import { sugerirEspecialidad, datosFaltantes } from '../../lib/sugerencia.js'
import { crearDerivacion } from '../../lib/circuito.js'
import { edad } from '../../lib/fechas.js'
import { Campo, Tarjeta } from '../../components/Comunes.jsx'

const PACIENTE_VACIO = { nombre: '', apellido: '', fechaNac: '', telefono: '', canal: 'papel', cronico: [] }

export default function NuevaDerivacion() {
  const { perfil, enLinea, notificar } = useApp()
  const navigate = useNavigate()

  const [dniTexto, setDniTexto] = useState('')
  const [paciente, setPaciente] = useState(null) // existente
  const [nuevo, setNuevo] = useState(PACIENTE_VACIO) // alta
  const [duplicados, setDuplicados] = useState([])
  const [form, setForm] = useState({ motivo: '', antecedentes: '', estudios: '', especialidad: '', prioridad: 'programada' })
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)

  const dni = validarDNI(dniTexto)

  // Buscar al paciente por DNI apenas el formato es válido.
  useEffect(() => {
    let vivo = true
    if (!dni.ok) {
      setPaciente(null)
      return
    }
    db.pacientes.where('dni').equals(dni.dni).first().then((p) => {
      if (!vivo) return
      setPaciente(p ?? null)
      if (p && !form.antecedentes && p.cronico?.length) {
        setForm((f) => ({ ...f, antecedentes: `Paciente con ${p.cronico.join(' + ')} en seguimiento en CAPS.` }))
      }
    })
    return () => {
      vivo = false
    }
  }, [dni.ok, dni.dni]) // eslint-disable-line react-hooks/exhaustive-deps

  // Alta nueva: avisar posibles duplicados antes de crear otro registro.
  useEffect(() => {
    if (!dni.ok || paciente) return setDuplicados([])
    buscarPosiblesDuplicados({ dni: dni.dni, apellido: nuevo.apellido, fechaNac: nuevo.fechaNac }).then(setDuplicados)
  }, [dni.ok, dni.dni, paciente, nuevo.apellido, nuevo.fechaNac])

  const sugerencia = useMemo(() => sugerirEspecialidad(`${form.motivo} ${form.antecedentes} ${form.estudios}`), [form.motivo, form.antecedentes, form.estudios])
  const canal = paciente?.canal ?? nuevo.canal
  const telefono = paciente?.telefono ?? nuevo.telefono
  const faltantes = datosFaltantes({ ...form, canal, telefono })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setN = (k) => (e) => setNuevo((n) => ({ ...n, [k]: e.target.value }))
  const toggleCronico = (c) => setNuevo((n) => ({ ...n, cronico: n.cronico.includes(c) ? n.cronico.filter((x) => x !== c) : [...n.cronico, c] }))

  const usarDuplicado = (p) => {
    setDniTexto(p.dni)
    setDuplicados([])
  }

  async function enviar(e) {
    e.preventDefault()
    const errs = {}
    if (!dni.ok) errs.dni = dni.error
    if (!paciente) {
      if (!nuevo.nombre.trim()) errs.nombre = 'Falta el nombre.'
      if (!nuevo.apellido.trim()) errs.apellido = 'Falta el apellido.'
      if (!nuevo.fechaNac) errs.fechaNac = 'Falta la fecha de nacimiento.'
    }
    if (form.motivo.trim().length < 5) errs.motivo = 'Describí el motivo de la derivación.'
    if (!form.especialidad) errs.especialidad = 'Elegí la especialidad.'
    setErrores(errs)
    if (Object.keys(errs).length) return

    setGuardando(true)
    try {
      let pacienteId = paciente?.id
      if (!pacienteId) {
        pacienteId = nuevoId()
        await db.pacientes.add({ id: pacienteId, dni: dni.dni, ...nuevo, nombre: nuevo.nombre.trim(), apellido: nuevo.apellido.trim(), capsId: perfil.efectorId, ultimoControl: null })
      }
      const hospital = await db.efectores.where('tipo').equals('hospital').first()
      const id = await crearDerivacion(
        { pacienteId, capsId: perfil.efectorId, hospitalId: hospital.id, especialidad: form.especialidad, motivo: form.motivo.trim(), antecedentes: form.antecedentes.trim(), estudios: form.estudios.trim(), prioridad: form.prioridad, canal },
        enLinea,
      )
      notificar(enLinea ? 'Derivación enviada.' : 'Derivación guardada en el equipo. Se enviará al volver la señal.')
      navigate(`/caps/derivacion/${id}`, { replace: true })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <div className="encabezado">
        <h1>Nueva derivación</h1>
      </div>
      {!enLinea && (
        <p className="banner-alerta">Estás sin conexión. Podés cargar la derivación igual: el turno se asigna contra el cupo protegido cuando vuelva la señal.</p>
      )}

      <Tarjeta titulo="1. Paciente">
        <Campo label="DNI" error={errores.dni || (dniTexto.length >= 7 && !dni.ok ? dni.error : null)} ayuda="Sin puntos. Se valida antes de asignar turno.">
          <input inputMode="numeric" autoComplete="off" value={dniTexto} onChange={(e) => setDniTexto(e.target.value)} placeholder="Ej.: 11234567" autoFocus />
        </Campo>

        {dni.ok && paciente && (
          <div className="paciente-encontrado">
            <strong>{nombreCompleto(paciente)}</strong>
            <span>{edad(paciente.fechaNac)} años{paciente.cronico?.length ? ` · ${paciente.cronico.join(' + ')}` : ''}</span>
            <span>Aviso por: {CANALES[paciente.canal]}{paciente.telefono ? ` · ${paciente.telefono}` : ''}</span>
          </div>
        )}

        {dni.ok && !paciente && (
          <>
            <p className="nota">No está registrado. Cargá sus datos:</p>
            {duplicados.length > 0 && (
              <div className="banner-alerta">
                <strong>¿Es alguno de estos pacientes?</strong> Evitemos un registro duplicado.
                <ul className="duplicados">
                  {duplicados.map((p) => (
                    <li key={p.id}>
                      {nombreCompleto(p)} · DNI {p.dni} · nac. {p.fechaNac}
                      <button type="button" className="btn btn-chico" onClick={() => usarDuplicado(p)}>Es este</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grilla-2">
              <Campo label="Nombre" error={errores.nombre}><input value={nuevo.nombre} onChange={setN('nombre')} /></Campo>
              <Campo label="Apellido" error={errores.apellido}><input value={nuevo.apellido} onChange={setN('apellido')} /></Campo>
              <Campo label="Fecha de nacimiento" error={errores.fechaNac}><input type="date" value={nuevo.fechaNac} onChange={setN('fechaNac')} /></Campo>
              <Campo label="Teléfono (paciente o familiar)"><input inputMode="tel" value={nuevo.telefono} onChange={setN('telefono')} placeholder="Ej.: 2364551234" /></Campo>
            </div>
            <Campo label="¿Cómo le avisamos el turno?">
              <select value={nuevo.canal} onChange={setN('canal')}>
                {Object.entries(CANALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <fieldset className="checks">
              <legend>Crónico</legend>
              {['DBT', 'HTA'].map((c) => (
                <label key={c}><input type="checkbox" checked={nuevo.cronico.includes(c)} onChange={() => toggleCronico(c)} /> {c === 'DBT' ? 'Diabetes' : 'Hipertensión'}</label>
              ))}
            </fieldset>
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="2. Motivo y antecedentes">
        <Campo label="Motivo de la derivación" error={errores.motivo}>
          <textarea rows={3} value={form.motivo} onChange={set('motivo')} placeholder="Qué le pasa y qué se pregunta al especialista" />
        </Campo>
        <Campo label="Antecedentes y medicación">
          <textarea rows={2} value={form.antecedentes} onChange={set('antecedentes')} />
        </Campo>
        <Campo label="Estudios realizados">
          <textarea rows={2} value={form.estudios} onChange={set('estudios')} placeholder='Ej.: ECG del 10/10, laboratorio. O "ninguno".' />
        </Campo>
      </Tarjeta>

      <Tarjeta titulo="3. Especialidad">
        {sugerencia && sugerencia.especialidad !== form.especialidad && (
          <div className="sugerencia">
            <div>
              <strong>Sugerencia: {sugerencia.especialidad}</strong>
              <span className="nota">Por: {sugerencia.porque.join(', ')}. Es una sugerencia: confirmala vos.</span>
            </div>
            <button type="button" className="btn btn-chico" onClick={() => setForm((f) => ({ ...f, especialidad: sugerencia.especialidad }))}>Usar</button>
          </div>
        )}
        <div className="grilla-2">
          <Campo label="Especialidad" error={errores.especialidad}>
            <select value={form.especialidad} onChange={set('especialidad')}>
              <option value="">Elegir…</option>
              {ESPECIALIDADES.map((e) => <option key={e}>{e}</option>)}
            </select>
          </Campo>
          <Campo label="Prioridad">
            <select value={form.prioridad} onChange={set('prioridad')}>
              <option value="programada">Programada</option>
              <option value="preferente">Preferente</option>
            </select>
          </Campo>
        </div>
      </Tarjeta>

      {faltantes.length > 0 && (
        <div className="banner-info">
          <strong>Para que el especialista reciba bien al paciente, conviene completar:</strong>
          <ul>{faltantes.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}

      <div className="acciones-fijas">
        <button type="submit" className="btn btn-primario btn-grande" disabled={guardando}>
          {guardando ? 'Guardando…' : enLinea ? 'Derivar y asignar turno' : 'Guardar derivación (sin conexión)'}
        </button>
      </div>
    </form>
  )
}
