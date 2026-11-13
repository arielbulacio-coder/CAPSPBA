import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../AppContext.jsx'
import { ingresarPaciente } from '../../lib/ciudadano.js'
import { Campo } from '../../components/Comunes.jsx'

export default function IngresoPaciente() {
  const { setPerfil } = useApp()
  const navigate = useNavigate()
  const [dni, setDni] = useState('')
  const [fechaNac, setFechaNac] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const entrar = async (e) => {
    e.preventDefault()
    setEnviando(true)
    const r = await ingresarPaciente(dni, fechaNac)
    setEnviando(false)
    if (r.error) return setError(r.error)
    setPerfil({ rol: 'paciente', pacienteId: r.paciente.id, efectorId: r.paciente.capsId, nombre: r.paciente.nombre })
    navigate('/paciente', { replace: true })
  }

  return (
    <div className="inicio">
      <header className="inicio-header">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="48" height="48" />
        <h1>Mis turnos y controles</h1>
        <p>Consultá tus turnos con especialistas, confirmalos y seguí las indicaciones de tu CAPS.</p>
      </header>

      <form className="tarjeta" onSubmit={entrar} noValidate>
        <Campo label="DNI" ayuda="Sin puntos.">
          <input inputMode="numeric" autoComplete="off" value={dni} onChange={(e) => setDni(e.target.value)} placeholder="Ej.: 11234567" autoFocus />
        </Campo>
        <Campo label="Fecha de nacimiento">
          <input type="date" value={fechaNac} onChange={(e) => setFechaNac(e.target.value)} />
        </Campo>
        {error && <p className="banner-alerta" role="alert">{error}</p>}
        <button className="btn btn-primario btn-grande" disabled={enviando}>{enviando ? 'Buscando…' : 'Ingresar'}</button>
        <p className="nota">
          Prototipo: el ingreso real se valida con Mi Argentina. Para probar, usá la paciente ficticia
          <strong> DNI 11234567</strong>, nacida el <strong>14/03/1957</strong>.
        </p>
      </form>

      <footer className="inicio-pie">
        <p>¿No tenés turnos todavía? <Link to="/cerca">Buscá tu CAPS más cercano</Link>.</p>
        <Link to="/">← Volver</Link>
      </footer>
    </div>
  )
}
