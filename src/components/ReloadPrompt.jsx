import { useRegisterSW } from 'virtual:pwa-register/react'

// Aviso de "lista para usar sin conexión" y de nueva versión disponible.
export default function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null

  const cerrar = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div className="pwa-aviso" role="alert">
      <span>{offlineReady ? 'La app quedó instalada para usarse sin conexión.' : 'Hay una versión nueva de la app.'}</span>
      <span className="pwa-acciones">
        {needRefresh && (
          <button className="btn btn-primario btn-chico" onClick={() => updateServiceWorker(true)}>Actualizar</button>
        )}
        <button className="btn btn-chico" onClick={cerrar}>Cerrar</button>
      </span>
    </div>
  )
}
