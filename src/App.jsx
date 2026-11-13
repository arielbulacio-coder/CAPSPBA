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
      <Route path="/cerca" element={<Cercanos />} />
      <Route element={<Layout />}>
        <Route path="/caps" element={<Requiere rol="caps"><CapsDerivados /></Requiere>} />
        <Route path="/caps/nueva" element={<Requiere rol="caps"><NuevaDerivacion /></Requiere>} />
        <Route path="/caps/derivacion/:id" element={<Requiere rol="caps"><DerivacionDetalle /></Requiere>} />
        <Route path="/caps/controles" element={<Requiere rol="caps"><Controles /></Requiere>} />
        <Route path="/hospital" element={<Requiere rol="hospital"><Agenda /></Requiere>} />
        <Route path="/hospital/atencion/:id" element={<Requiere rol="hospital"><Atencion /></Requiere>} />
        <Route path="/hospital/cupos" element={<Requiere rol="hospital"><Cupos /></Requiere>} />
        <Route path="/gestion" element={<Requiere rol="gestion"><Indicadores /></Requiere>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
