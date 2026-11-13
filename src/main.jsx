import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { AppProvider } from './AppContext.jsx'
import { inicializarDB } from './lib/db.js'
import './styles.css'

const root = createRoot(document.getElementById('root'))

inicializarDB()
  .catch((e) => console.error('No se pudo inicializar la base local', e))
  .finally(() => {
    root.render(
      <StrictMode>
        <HashRouter>
          <AppProvider>
            <App />
          </AppProvider>
        </HashRouter>
      </StrictMode>,
    )
  })
