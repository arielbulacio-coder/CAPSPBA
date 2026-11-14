import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../../AppContext.jsx'
import { ingresarPaciente } from '../../lib/ciudadano.js'
import { FUNCIONES_URL, ingresoDemoHabilitado, miArgentinaHabilitado } from '../../lib/firebaseConfig.js'
import { Campo } from '../../components/Comunes.jsx'

// Respuestas de functions/miargentina.js, explicadas para la persona.
const ERRORES_MI_ARGENTINA = {
  cancelado: 'Cancelaste el ingreso con Mi Argentina.',
  identidad_no_validada: 'Tu cuenta de Mi Argentina todavía no tiene la identidad validada. Validala en la app Mi Argentina (con tu DNI y una foto) y volvé a intentar.',
  dni_no_coincide: 'Los datos de tu cuenta de Mi Argentina no coinciden con tu DNI. Revisalos en Mi Argentina.',
  sin_dni: 'Mi Argentina no nos informó tu DNI. Revisá que tu cuenta tenga los datos completos.',
  no_registrado: 'Tu identidad está validada, pero no estás registrada/o en un CAPS de la red. Acercate a tu CAPS para que te registren.',
  datos_distintos: 'Tu fecha de nacimiento en Mi Argentina no coincide con la de tu CAPS. Acercate a tu CAPS para corregirla.',
  vencido: 'El ingreso tardó demasiado. Volvé a intentar.',
  no_configurado: 'El ingreso con Mi Argentina todavía no está habilitado.',
  mi_argentina: 'No pudimos validar tu identidad con Mi Argentina. Probá de nuevo en unos minutos.',
}

export default function IngresoPaciente() {
  const { setPerfil, nubeRef, enLinea } = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [dni, setDni] = useState('')
  const [fechaNac, setFechaNac] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [validando, setValidando] = useState(false)
  const canjeado = useRef(false)

  // Vuelta de Mi Argentina: ?codigo=… (de un solo uso) o ?error=…
  useEffect(() => {
    const codigo = params.get('codigo')
    const err = params.get('error')
    if (err) {
      setError(ERRORES_MI_ARGENTINA[err] ?? ERRORES_MI_ARGENTINA.mi_argentina)
      setParams({}, { replace: true })
      return
    }
    if (!codigo || canjeado.current) return
    canjeado.current = true
    setParams({}, { replace: true })
    setValidando(true)
    ;(async () => {
      try {
        const nube = nubeRef.current ?? (await import('../../lib/nube.js'))
        nube.iniciarNube({ enLinea })
        const p = await nube.ingresarConMiArgentina(codigo)
        setPerfil({ rol: 'paciente', pacienteId: p.id, efectorId: p.capsId, nombre: p.nombre, verificado: 'mi-argentina' })
        navigate('/paciente', { replace: true })
      } catch (e) {
        console.error(e)
        setError(e?.code === 'functions/not-found' ? 'El ingreso venció. Volvé a ingresar con Mi Argentina.' : ERRORES_MI_ARGENTINA.mi_argentina)
        setValidando(false)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const conMiArgentina = () => {
    const volver = `${window.location.origin}${window.location.pathname}`
    window.location.assign(`${FUNCIONES_URL}/miArgentinaInicio?volver=${encodeURIComponent(volver)}`)
  }

  const entrar = async (e) => {
    e.preventDefault()
    setEnviando(true)
    const r = await ingresarPaciente(dni, fechaNac)
    setEnviando(false)
    if (r.error) return setError(r.error)
    setPerfil({ rol: 'paciente', pacienteId: r.paciente.id, efectorId: r.paciente.capsId, nombre: r.paciente.nombre })
    navigate('/paciente', { replace: true })
  }

  if (validando) {
    return (
      <div className="inicio">
        <p className="vacio" role="status">Validando tu identidad con Mi Argentina…</p>
      </div>
    )
  }

  return (
    <div className="inicio">
      <header className="inicio-header">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="48" height="48" />
        <h1>Mis turnos y controles</h1>
        <p>Consultá tus turnos con especialistas, confirmalos y seguí las indicaciones de tu CAPS.</p>
      </header>

      {error && <p className="banner-alerta" role="alert">{error}</p>}

      {miArgentinaHabilitado && (
        <div className="tarjeta">
          <button type="button" className="btn btn-primario btn-grande" onClick={conMiArgentina} disabled={!enLinea}>
            Ingresar con Mi Argentina
          </button>
          <p className="nota">
            {enLinea
              ? 'Validamos tu identidad con Mi Argentina (cuenta con identidad validada). No compartimos tu historia con nadie fuera de la red de salud.'
              : 'Para ingresar con Mi Argentina hace falta conexión.'}
          </p>
        </div>
      )}

      {ingresoDemoHabilitado && (
        <form className="tarjeta" onSubmit={entrar} noValidate>
          {miArgentinaHabilitado && <h2 className="seccion">Ingreso de demostración</h2>}
          <Campo label="DNI" ayuda="Sin puntos.">
            <input inputMode="numeric" autoComplete="off" value={dni} onChange={(e) => setDni(e.target.value)} placeholder="Ej.: 11234567" autoFocus={!miArgentinaHabilitado} />
          </Campo>
          <Campo label="Fecha de nacimiento">
            <input type="date" value={fechaNac} onChange={(e) => setFechaNac(e.target.value)} />
          </Campo>
          <button className="btn btn-primario btn-grande" disabled={enviando}>{enviando ? 'Buscando…' : 'Ingresar'}</button>
          <p className="nota">
            {miArgentinaHabilitado ? 'Sólo para la demostración, sin validar identidad.' : 'Prototipo: el ingreso real se valida con Mi Argentina.'} Para probar, usá la paciente ficticia
            <strong> DNI 11234567</strong>, nacida el <strong>14/03/1957</strong>.
          </p>
        </form>
      )}

      <footer className="inicio-pie">
        <p>¿No tenés turnos todavía? <Link to="/cerca">Buscá tu CAPS más cercano</Link>.</p>
        <Link to="/">← Volver</Link>
      </footer>
    </div>
  )
}
