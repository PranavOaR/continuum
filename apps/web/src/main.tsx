import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { invalidateQueries, LIVE_CACHE_TTL_MS, PUSHED_CACHE_TTL_MS, setQueryCacheTtl } from './hooks/useServiceQuery'
import { dataMode } from './services'
import { connectLiveUpdates } from './services/liveUpdates'
import './styles/globals.css'

// Live local data changes under the dashboard; the demo dataset never does.
if (dataMode() === 'local') {
  setQueryCacheTtl(LIVE_CACHE_TTL_MS)
  connectLiveUpdates({
    onChange: invalidateQueries,
    onConnected: () => setQueryCacheTtl(PUSHED_CACHE_TTL_MS),
    onDisconnected: () => setQueryCacheTtl(LIVE_CACHE_TTL_MS),
  })
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
