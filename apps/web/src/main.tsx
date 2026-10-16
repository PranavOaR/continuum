import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { LIVE_CACHE_TTL_MS, setQueryCacheTtl } from './hooks/useServiceQuery'
import { dataMode } from './services'
import './styles/globals.css'

// Live local data changes under the dashboard; the demo dataset never does.
if (dataMode() === 'local') setQueryCacheTtl(LIVE_CACHE_TTL_MS)

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
