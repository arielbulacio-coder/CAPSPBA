import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../AppContext.jsx'
import { db, reiniciarDemo } from '../lib/db.js'
import BuscadorEfector from '../components/BuscadorEfector.jsx'

export default function Inicio() {
  const { setPerfil, nube, nubeRef } = useApp()
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
    const enRed = nube?.fase === 'activa' && nubeRef.current
    if (!confirm(enRed
      ? '¿Borrar los datos cargados en este equipo? Después se vuelven a descargar los datos compartidos de la red.'
      : '¿Borrar los datos cargados en este equipo y volver a los datos de demostración?')) return
    const paraTodos = enRed && confirm('¿Reiniciar también los datos compartidos en la nube (Firebase)? Se borran para TODOS los equipos y vuelven los datos de demostración.\n\nAceptar: reiniciar para todos · Cancelar: sólo este equipo')
    await reiniciarDemo()
    try {
      if (paraTodos) {
        await nubeRef.current.reiniciarNube()
        alert('Datos de demostración reiniciados para todos los equipos.')
      } else if (enRed) {
        await nubeRef.current.volverABajar()
      }
    } catch (e) {
      alert(`No se pudo reiniciar la nube: ${e.message}`)
    }
  }

  const efectorId = efector?.id ?? (rol && piloto?.[rol])

  return (
    <div className="inicio">
      <div className="institucional">
        <span className="institucional-ministerio">Ministerio de Salud</span>
        <span className="institucional-provincia">Provincia de Buenos Aires</span>
      </div>

      <header className="inicio-header">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="64" height="64" />
        <h1>Red CAPS</h1>
        <p className="caps-significado">
          <strong>C</strong>entros de <strong>A</strong>tención <strong>P</strong>rimaria de la <strong>S</strong>alud
        </p>
        <p>Derivación de circuito cerrado CAPS → hospital → CAPS</p>
        {resumen && (
          <ul className="inicio-cifras">
            <li><strong>{resumen.hospitales}</strong><span>hospitales públicos</span></li>
            <li><strong>{resumen.caps}</strong><span>CAPS</span></li>
            <li><strong>{resumen.partidos}</strong><span>partidos</span></li>
          </ul>
        )}
      </header>

      <img className="inicio-hero" src={`${import.meta.env.BASE_URL}img/hero.jpg`} alt="Centro de Atención Primaria de la Salud y hospital público de la provincia" />

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
          <img className="perfil-img" src={`${import.meta.env.BASE_URL}img/caps.jpg`} alt="Médica atendiendo a una madre y su hijo en un CAPS" loading="lazy" />
          <h2>Trabajo en un CAPS</h2>
          <p>Derivar con turno en el momento, avisar al paciente y saber qué se resolvió.</p>
          {rol !== 'caps' && <button className="btn btn-primario" onClick={() => elegirRol('caps')}>Elegir mi CAPS</button>}
        </section>

        <section className={`perfil ${rol === 'hospital' ? 'perfil-activo' : ''}`}>
          <img className="perfil-img" src={`${import.meta.env.BASE_URL}img/hospital.jpg`} alt="Especialista y enfermera revisando la historia clínica" loading="lazy" />
          <h2>Trabajo en un hospital</h2>
          <p>Recibir al paciente con motivo, antecedentes y estudios; contrarreferir en 3 campos.</p>
          {rol !== 'hospital' && <button className="btn btn-primario" onClick={() => elegirRol('hospital')}>Elegir mi hospital</button>}
        </section>

        <section className="perfil">
          <img className="perfil-img" src={`${import.meta.env.BASE_URL}img/administrativo.jpg`} alt="Personal administrativo asignando un turno" loading="lazy" />
          <h2>Gestión provincial</h2>
          <p>Seguir las 3 metas del Plan por partido y el portafolio de transformación digital con su roadmap 2027–2029.</p>
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
        <p className="inicio-pie-inst">Ministerio de Salud · Provincia de Buenos Aires</p>
        <p>Prototipo: los establecimientos son reales; pacientes y derivaciones son ficticios y se guardan sólo en este equipo.</p>
        <button className="btn-link" onClick={reiniciar}>Reiniciar datos de demostración</button>
      </footer>
    </div>
  )
}

