import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './AppContext.jsx'
import Layout from './components/Layout.jsx'
import Inicio from './pages/Inicio.jsx'
import Cercanos from './pages/Cercanos.jsx'
import CapsDerivados from './pages/caps/CapsDerivados.jsx'
import NuevaDerivacion from './pages/caps/NuevaDerivacion.jsx'
import DerivacionDetalle from './pages/caps/DerivacionDetalle.jsx'
import Controles from './pages/caps/Controles.jsx'
import Agenda from './pages/hospital/Agenda.jsx'
import Atencion from './pages/hospital/Atencion.jsx'
import Cupos from './pages/hospital/Cupos.jsx'
import Indicadores from './pages/gestion/Indicadores.jsx'
import Portafolio from './pages/gestion/Portafolio.jsx'
import Roadmap from './pages/gestion/Roadmap.jsx'
import IngresoPaciente from './pages/paciente/IngresoPaciente.jsx'
import MisTurnos from './pages/paciente/MisTurnos.jsx'
import MiSalud from './pages/paciente/MiSalud.jsx'
import MiHistoria from './pages/paciente/MiHistoria.jsx'
import BuscarPaciente from './pages/hcu/BuscarPaciente.jsx'
import HistoriaClinica from './pages/hcu/HistoriaClinica.jsx'

// El mapa (Leaflet) se carga sólo al abrir la navegación.
const Navegar = lazy(() => import('./pages/Navegar.jsx'))
const conCarga = (el) => <Suspense fallback={<p className="vacio">Cargando mapa…</p>}>{el}</Suspense>

function Requiere({ rol, children }) {
  const { perfil } = useApp()
  if (!perfil) return <Navigate to="/" replace />
  if (perfil.rol !== rol) return <Navigate to={`/${perfil.rol}`} replace />
  return children
}

export default function App() {
  const { perfil } = useApp()
  return (
    <Routes>
      <Route path="/" element={perfil ? <Navigate to={`/${perfil.rol}`} replace /> : <Inicio />} />
      {!perfil && <Route path="/cerca" element={<Cercanos />} />}
      {!perfil && <Route path="/paciente/ingreso" element={<IngresoPaciente />} />}
      {!perfil && <Route path="/navegar/:id" element={conCarga(<Navegar />)} />}
      <Route element={<Layout />}>
        {perfil && <Route path="/cerca" element={<Cercanos enLayout />} />}
        {perfil && <Route path="/navegar/:id" element={conCarga(<Navegar />)} />}
        <Route path="/caps" element={<Requiere rol="caps"><CapsDerivados /></Requiere>} />
        <Route path="/caps/nueva" element={<Requiere rol="caps"><NuevaDerivacion /></Requiere>} />
        <Route path="/caps/derivacion/:id" element={<Requiere rol="caps"><DerivacionDetalle /></Requiere>} />
        <Route path="/caps/controles" element={<Requiere rol="caps"><Controles /></Requiere>} />
        <Route path="/caps/pacientes" element={<Requiere rol="caps"><BuscarPaciente /></Requiere>} />
        <Route path="/caps/hcu/:id" element={<Requiere rol="caps"><HistoriaClinica /></Requiere>} />
        <Route path="/hospital/pacientes" element={<Requiere rol="hospital"><BuscarPaciente /></Requiere>} />
        <Route path="/hospital/hcu/:id" element={<Requiere rol="hospital"><HistoriaClinica /></Requiere>} />
        <Route path="/hospital" element={<Requiere rol="hospital"><Agenda /></Requiere>} />
        <Route path="/hospital/atencion/:id" element={<Requiere rol="hospital"><Atencion /></Requiere>} />
        <Route path="/hospital/cupos" element={<Requiere rol="hospital"><Cupos /></Requiere>} />
        <Route path="/gestion" element={<Requiere rol="gestion"><Indicadores /></Requiere>} />
        <Route path="/gestion/portafolio" element={<Requiere rol="gestion"><Portafolio /></Requiere>} />
        <Route path="/gestion/roadmap" element={<Requiere rol="gestion"><Roadmap /></Requiere>} />
        <Route path="/paciente" element={<Requiere rol="paciente"><MisTurnos /></Requiere>} />
        <Route path="/paciente/salud" element={<Requiere rol="paciente"><MiSalud /></Requiere>} />
        <Route path="/paciente/historia" element={<Requiere rol="paciente"><MiHistoria /></Requiere>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
