import { createContext, useContext, type ReactNode } from 'react'
import { LIVE_CACHE_TTL_MS, setQueryCacheTtl } from '../hooks/useServiceQuery'
import { dataMode, type DataMode } from '../services'

const DataModeContext = createContext<DataMode>('demo')

export function DataModeProvider({ children }: { children: ReactNode }) {
  const mode = dataMode()
  if (mode === 'local') setQueryCacheTtl(LIVE_CACHE_TTL_MS)
  return <DataModeContext.Provider value={mode}>{children}</DataModeContext.Provider>
}

/** Whether screens show live local data or the demo dataset; labels must say which. */
// oxlint-disable-next-line react(only-export-components) -- the hook belongs with its provider
export function useDataMode(): DataMode {
  return useContext(DataModeContext)
}

/** True for live local data, false for the demo dataset. */
// oxlint-disable-next-line react(only-export-components) -- the hook belongs with its provider
export function useIsLive(): boolean {
  return useDataMode() === 'local'
}
