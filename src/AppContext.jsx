import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { sincronizar } from './lib/circuito.js'

const Ctx = createContext(null)

const leer = (k, def) => {
  try {
    const v = localStorage.getItem(k)
    return v == null ? def : JSON.parse(v)
  } catch {
    return def
  }
}
const guardar = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* almacenamiento no disponible: se mantiene en memoria */
  }
}

export function AppProvider({ children }) {
  // perfil: { rol: 'caps' | 'hospital' | 'gestion', efectorId }
  const [perfil, setPerfilState] = useState(() => leer('perfil', null))
  const [redNavegador, setRedNavegador] = useState(() => navigator.onLine)
  // Permite demostrar el trabajo sin conexión aunque el equipo tenga internet.
  const [simularSinConexion, setSimular] = useState(() => leer('simularSinConexion', false))
  const [aviso, setAviso] = useState(null)
  const enLinea = redNavegador && !simularSinConexion
  const anterior = useRef(enLinea)

  const setPerfil = (p) => {
    setPerfilState(p)
    guardar('perfil', p)
  }
  const toggleSimular = () => {
    setSimular((v) => {
      guardar('simularSinConexion', !v)
      return !v
    })
  }

  const notificar = useCallback((texto) => {
    setAviso(texto)
    setTimeout(() => setAviso((a) => (a === texto ? null : a)), 4000)
  }, [])

  const sincronizarAhora = useCallback(async () => {
    const r = await sincronizar()
    if (r.asignadas) notificar(`Sincronizado: ${r.asignadas} turno${r.asignadas > 1 ? 's' : ''} asignado${r.asignadas > 1 ? 's' : ''}.`)
    return r
  }, [notificar])

  useEffect(() => {
    const on = () => setRedNavegador(true)
    const off = () => setRedNavegador(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Al recuperar la conexión, se envía todo lo cargado sin señal.
  useEffect(() => {
    if (enLinea && !anterior.current) sincronizarAhora()
    anterior.current = enLinea
  }, [enLinea, sincronizarAhora])

  useEffect(() => {
    if (enLinea) sincronizarAhora()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider value={{ perfil, setPerfil, enLinea, redNavegador, simularSinConexion, toggleSimular, sincronizarAhora, notificar, aviso }}>
      {children}
    </Ctx.Provider>
  )
}

export const useApp = () => useContext(Ctx)
