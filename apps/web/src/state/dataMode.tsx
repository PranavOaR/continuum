import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { LIVE_CACHE_TTL_MS, setQueryCacheTtl } from '../hooks/useServiceQuery'
import { dataMode, type DataMode } from '../services'

export type DataModeState = DataMode | 'detecting'

const DataModeContext = createContext<DataModeState>('detecting')

export function DataModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DataModeState>('detecting')
  useEffect(() => {
    let isCancelled = false
    void dataMode().then((resolved) => {
      if (resolved === 'local') setQueryCacheTtl(LIVE_CACHE_TTL_MS)
      if (!isCancelled) setMode(resolved)
    })
    return () => {
      isCancelled = true
    }
  }, [])
  return <DataModeContext.Provider value={mode}>{children}</DataModeContext.Provider>
}

/** Whether screens show live local data or the demo dataset; labels must say which. */
// oxlint-disable-next-line react(only-export-components) -- the hook belongs with its provider
export function useDataMode(): DataModeState {
  return useContext(DataModeContext)
}
