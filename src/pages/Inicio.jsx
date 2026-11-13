import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../AppContext.jsx'
import { db, reiniciarDemo } from '../lib/db.js'

export default function Inicio() {
  const { setPerfil } = useApp()
  const navigate = useNavigate()
  const caps = useLiveQuery(() => db.efectores.where('tipo').equals('caps').toArray(), [], [])
  const hospitales = useLiveQuery(() => db.efectores.where('tipo').equals('hospital').toArray(), [], [])
  const [capsId, setCapsId] = useState('')

  const entrar = (rol, efectorId = null) => {
    setPerfil({ rol, efectorId })
    navigate(`/${rol}`)
  }

  const reiniciar = async () => {
    if (confirm('¿Borrar los datos cargados en este equipo y volver a los datos de demostración?')) {
      await reiniciarDemo()
    }
  }

  const capsElegido = capsId || caps[0]?.id

  return (
    <div className="inicio">
      <header className="inicio-header">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="56" height="56" />
        <h1>Red CAPS</h1>
        <p>Derivación de circuito cerrado: CAPS → hospital → CAPS.<br />Piloto de cardiología con cupo protegido.</p>
      </header>

      <div className="perfiles">
        <section className="perfil">
          <h2>Soy del CAPS</h2>
          <p>Derivar con turno en el momento, avisar al paciente y saber qué se resolvió.</p>
          <select value={capsElegido ?? ''} onChange={(e) => setCapsId(e.target.value)} aria-label="Elegí tu CAPS">
            {caps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}{c.sinConexion ? ' (sin conexión estable)' : ''}
              </option>
            ))}
          </select>
          <button className="btn btn-primario" onClick={() => entrar('caps', capsElegido)} disabled={!capsElegido}>Entrar al CAPS</button>
        </section>

        <section className="perfil">
          <h2>Soy del hospital</h2>
          <p>Recibir al paciente con motivo, antecedentes y estudios; contrarreferir en 3 campos.</p>
          <button className="btn btn-primario" onClick={() => entrar('hospital', hospitales[0]?.id)} disabled={!hospitales.length}>
            Entrar a {hospitales[0]?.nombre ?? 'hospital'}
          </button>
        </section>

        <section className="perfil">
          <h2>Gestión</h2>
          <p>Seguir las 3 metas del Plan: espera, control de crónicos e internaciones.</p>
          <button className="btn btn-primario" onClick={() => entrar('gestion')}>Ver indicadores</button>
        </section>
      </div>

      <footer className="inicio-pie">
        <p>Prototipo con datos ficticios guardados sólo en este equipo.</p>
        <button className="btn-link" onClick={reiniciar}>Reiniciar datos de demostración</button>
      </footer>
    </div>
  )
}
