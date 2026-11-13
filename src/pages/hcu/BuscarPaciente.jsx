import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../AppContext.jsx'
import { db } from '../../lib/db.js'
import { edad } from '../../lib/fechas.js'
import { nombreCompleto } from '../../lib/pacientes.js'
import { Vacio, Cargando } from '../../components/Comunes.jsx'

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function BuscarPaciente() {
  const { perfil } = useApp()
  const [texto, setTexto] = useState('')
  const datos = useLiveQuery(async () => {
    const pacientes = (await db.pacientes.toArray()).filter((p) => !p.fusionadoCon)
    const caps = Object.fromEntries((await db.efectores.bulkGet([...new Set(pacientes.map((p) => p.capsId))])).filter(Boolean).map((e) => [e.id, e]))
    return { pacientes, caps }
  }, [])
  if (!datos) return <Cargando />

  const palabras = norm(texto).split(/\s+/).filter(Boolean)
  const propios = perfil.rol === 'caps'
  const lista = datos.pacientes
    .filter((p) => (palabras.length ? palabras.every((w) => norm(`${p.dni} ${p.nombre} ${p.apellido} ${(p.dnisAnteriores ?? []).join(' ')}`).includes(w)) : !propios || p.capsId === perfil.efectorId))
    .sort((a, b) => a.apellido.localeCompare(b.apellido, 'es'))
    .slice(0, 50)

  return (
    <>
      <div className="encabezado"><h1>Historia clínica única</h1></div>
      <p className="nota">Una sola historia por persona para toda la red: CAPS, hospitales y teleconsultas.</p>
      <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por DNI, nombre o apellido" aria-label="Buscar paciente" autoFocus />
      {!texto && propios && <p className="nota">Pacientes de tu CAPS. Escribí para buscar en toda la provincia.</p>}
      {lista.length === 0 ? <Vacio>No encontramos pacientes.</Vacio> : (
        <ul className="lista">
          {lista.map((p) => (
            <li key={p.id}>
              <Link to={`/${perfil.rol}/hcu/${p.id}`} className="item">
                <div className="item-principal">
                  <strong>{nombreCompleto(p)}</strong>
                  <span className="item-sub">DNI {p.dni} · {edad(p.fechaNac)} años · {datos.caps[p.capsId]?.nombre ?? '—'}</span>
                </div>
                <div className="item-lateral">
                  {p.alergias?.length > 0 && <span className="badge badge-error">Alergias</span>}
                  {p.cronico?.length > 0 && <span className="badge badge-info">{p.cronico.join(' + ')}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
