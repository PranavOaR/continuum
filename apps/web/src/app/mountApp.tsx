import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { invalidateQueries, LIVE_CACHE_TTL_MS, PUSHED_CACHE_TTL_MS, setQueryCacheTtl } from '../hooks/useServiceQuery'
import { dataMode } from '../services'
import { connectLiveUpdates } from '../services/liveUpdates'

// Live local data changes under the dashboard; the demo dataset never does.
if (dataMode() === 'local') {
  setQueryCacheTtl(LIVE_CACHE_TTL_MS)
  let hasConnected = false
  connectLiveUpdates({
    onChange: invalidateQueries,
    onConnected: () => {
      setQueryCacheTtl(PUSHED_CACHE_TTL_MS)
      // After a reconnect, changes made while the stream was down were never pushed.
      if (hasConnected) invalidateQueries()
      hasConnected = true
    },
    onDisconnected: () => setQueryCacheTtl(LIVE_CACHE_TTL_MS),
  })
}

export function mount(rootElement: HTMLElement): void {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
