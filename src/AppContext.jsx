import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { sincronizar } from './lib/circuito.js'
import { nubeHabilitada } from './lib/firebaseConfig.js'

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
  // Backend común (Firebase). Se carga aparte para no demorar la primera pantalla.
  const nubeRef = useRef(null)
  const [nube, setNube] = useState({ fase: nubeHabilitada ? 'iniciando' : 'desactivada', error: null, ultimaSync: null })

  const setPerfil = (p) => {
    setPerfilState(p)
    guardar('perfil', p)
    // El paciente que entró con Mi Argentina sale: se cierra su sesión en Firebase.
    if (!p) nubeRef.current?.salirPaciente().catch(() => {})
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
    nubeRef.current?.subir().catch(() => {})
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

  useEffect(() => {
    if (!nubeHabilitada) return
    let baja = null
    let cancelado = false
    import('./lib/nube.js')
      .then((m) => {
        if (cancelado) return
        nubeRef.current = m
        m.iniciarNube({ enLinea })
        baja = m.suscribirEstado(setNube)
      })
      .catch((e) => setNube({ fase: 'error', error: e.message, ultimaSync: null }))
    return () => {
      cancelado = true
      baja?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    nubeRef.current?.fijarConexion(enLinea)
  }, [enLinea])

  // Al recuperar la conexión, se envía todo lo cargado sin señal.
  useEffect(() => {
    if (enLinea && !anterior.current) sincronizarAhora()
    anterior.current = enLinea
  }, [enLinea, sincronizarAhora])

  useEffect(() => {
    if (enLinea) sincronizarAhora()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider value={{ perfil, setPerfil, enLinea, redNavegador, simularSinConexion, toggleSimular, sincronizarAhora, notificar, aviso, nube, nubeRef }}>
      {children}
    </Ctx.Provider>
  )
}

export const useApp = () => useContext(Ctx)
