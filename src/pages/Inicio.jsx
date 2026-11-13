import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../AppContext.jsx'
import { db, reiniciarDemo } from '../lib/db.js'
import BuscadorEfector from '../components/BuscadorEfector.jsx'

export default function Inicio() {
  const { setPerfil } = useApp()
  const navigate = useNavigate()
  const [rol, setRol] = useState(null)
  const [efector, setEfector] = useState(null)
  const resumen = useLiveQuery(async () => ({
    hospitales: await db.efectores.where('tipo').equals('hospital').count(),
    caps: await db.efectores.where('tipo').equals('caps').count(),
    partidos: (await db.efectores.orderBy('partido').uniqueKeys()).length,
  }), [])
  // Sugerencia inicial: el CAPS y el hospital del piloto de demostración.
  const piloto = useLiveQuery(async () => {
    const d = await db.derivaciones.orderBy('creadaEn').first()
    return d ? { caps: d.capsId, hospital: d.hospitalId } : null
  }, [])

  const elegirRol = (r) => {
    setRol(r)
    setEfector(null)
  }

  const entrar = (r, efectorId = null) => {
    setPerfil({ rol: r, efectorId })
    navigate(`/${r}`)
  }

  const reiniciar = async () => {
    if (confirm('¿Borrar los datos cargados en este equipo y volver a los datos de demostración?')) {
      await reiniciarDemo()
    }
  }

  const efectorId = efector?.id ?? (rol && piloto?.[rol])

  return (
    <div className="inicio">
      <header className="inicio-header">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="56" height="56" />
        <h1>Red CAPS</h1>
        <p>Derivación de circuito cerrado CAPS → hospital → CAPS<br />Provincia de Buenos Aires</p>
        {resumen && (
          <p className="nota">{resumen.hospitales} hospitales públicos · {resumen.caps} CAPS · {resumen.partidos} partidos</p>
        )}
      </header>

      <Link to="/cerca" className="perfil perfil-destacado">
        <h2>¿Cuál es mi CAPS más cercano?</h2>
        <p>Usá tu ubicación para encontrar el centro de salud o el hospital público más cerca tuyo.</p>
        <span className="btn btn-primario">Buscar cerca mío</span>
      </Link>

      <Link to="/paciente/ingreso" className="perfil perfil-destacado">
        <h2>Mis turnos y controles</h2>
        <p>Si te derivaron a un especialista: mirá tu turno, confirmalo o pedí otro día, recibí recordatorios y las indicaciones para tu CAPS.</p>
        <span className="btn btn-primario">Ingresar con mi DNI</span>
      </Link>

      <h2 className="seccion">Ingreso de equipos de salud</h2>
      <div className="perfiles">
        <section className={`perfil ${rol === 'caps' ? 'perfil-activo' : ''}`}>
          <h2>Trabajo en un CAPS</h2>
          <p>Derivar con turno en el momento, avisar al paciente y saber qué se resolvió.</p>
          {rol !== 'caps' && <button className="btn btn-primario" onClick={() => elegirRol('caps')}>Elegir mi CAPS</button>}
        </section>

        <section className={`perfil ${rol === 'hospital' ? 'perfil-activo' : ''}`}>
          <h2>Trabajo en un hospital</h2>
          <p>Recibir al paciente con motivo, antecedentes y estudios; contrarreferir en 3 campos.</p>
          {rol !== 'hospital' && <button className="btn btn-primario" onClick={() => elegirRol('hospital')}>Elegir mi hospital</button>}
        </section>

        <section className="perfil">
          <h2>Gestión provincial</h2>
          <p>Seguir las 3 metas del Plan por partido: espera, control de crónicos e internaciones.</p>
          <button className="btn btn-primario" onClick={() => entrar('gestion')}>Ver indicadores</button>
        </section>
      </div>

      {rol && (
        <section className="tarjeta">
          <header className="tarjeta-header">
            <h2>{rol === 'caps' ? '¿En qué CAPS trabajás?' : '¿En qué hospital trabajás?'}</h2>
            <button className="btn-link" onClick={() => setRol(null)}>Cancelar</button>
          </header>
          <p className="nota">Tocá “Cerca mío” para que te sugiramos el más cercano, o buscalo por nombre o partido.</p>
          <BuscadorEfector tipo={rol} valor={efectorId} onElegir={setEfector} />
          <button className="btn btn-primario btn-grande" disabled={!efectorId} onClick={() => entrar(rol, efectorId)}>
            Entrar
          </button>
        </section>
      )}

      <footer className="inicio-pie">
        <p>Prototipo: los establecimientos son reales; pacientes y derivaciones son ficticios y se guardan sólo en este equipo.</p>
        <button className="btn-link" onClick={reiniciar}>Reiniciar datos de demostración</button>
      </footer>
    </div>
  )
}
