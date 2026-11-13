import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../AppContext.jsx'
import { db } from '../lib/db.js'
import ReloadPrompt from './ReloadPrompt.jsx'

const NAV = {
  caps: [
    ['/caps', 'Derivados', true],
    ['/caps/nueva', 'Nueva derivación'],
    ['/caps/pacientes', 'Historia clínica'],
    ['/caps/controles', 'Crónicos y controles'],
    ['/cerca', 'CAPS cercanos'],
  ],
  hospital: [
    ['/hospital', 'Agenda', true],
    ['/hospital/pacientes', 'Historia clínica'],
    ['/hospital/cupos', 'Cupo protegido'],
    ['/cerca', 'Establecimientos cercanos'],
  ],
  gestion: [['/gestion', 'Indicadores', true]],
  paciente: [
    ['/paciente', 'Mis turnos', true],
    ['/paciente/salud', 'Mi salud'],
    ['/paciente/historia', 'Mi historia'],
    ['/cerca', 'CAPS cercanos'],
  ],
}

export default function Layout() {
  const { perfil, setPerfil, enLinea, redNavegador, simularSinConexion, toggleSimular, sincronizarAhora, aviso } = useApp()
  const navigate = useNavigate()
  const efector = useLiveQuery(() => (perfil?.efectorId ? db.efectores.get(perfil.efectorId) : undefined), [perfil?.efectorId])
  const pendientes = useLiveQuery(() => db.derivaciones.where('sincronizada').equals(0).count(), [], 0)

  const salir = () => {
    setPerfil(null)
    navigate('/')
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inst">
          <span><strong>Ministerio de Salud</strong> · Provincia de Buenos Aires</span>
          <span className="topbar-inst-caps">CAPS: Centros de Atención Primaria de la Salud</span>
        </div>
        <div className="topbar-fila">
          <div className="marca">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
            <div>
              <strong>Red CAPS</strong>
              <span className="marca-sub">{perfil?.rol === 'paciente' ? `${perfil.nombre} · ${efector?.nombre ?? ''}` : efector ? `${efector.nombre} · ${efector.partido}` : perfil?.rol === 'gestion' ? 'Gestión provincial' : ''}</span>
            </div>
          </div>
          <button className="btn-link topbar-salir" onClick={salir}>{perfil?.rol === 'paciente' ? 'Salir' : 'Cambiar perfil'}</button>
        </div>
        <nav className="tabs">
          {(NAV[perfil?.rol] ?? []).map(([to, label, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'activa' : ''}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className={`conexion ${enLinea ? 'en-linea' : 'sin-conexion'}`} role="status">
        <span className="punto" aria-hidden="true" />
        <span>
          {enLinea ? 'Con conexión' : 'Sin conexión — lo que cargues se guarda en el equipo'}
          {pendientes > 0 && ` · ${pendientes} pendiente${pendientes > 1 ? 's' : ''} de sincronizar`}
        </span>
        <span className="conexion-acciones">
          {enLinea && pendientes > 0 && (
            <button className="btn-mini" onClick={sincronizarAhora}>Sincronizar</button>
          )}
          {redNavegador && (
            <label className="interruptor" title="Para probar el modo sin conexión">
              <input type="checkbox" checked={simularSinConexion} onChange={toggleSimular} />
              <span>Simular sin señal</span>
            </label>
          )}
        </span>
      </div>

      <main className="contenido">
        <Outlet />
      </main>

      {aviso && <div className="toast" role="status">{aviso}</div>}
      <ReloadPrompt />
    </div>
  )
}
