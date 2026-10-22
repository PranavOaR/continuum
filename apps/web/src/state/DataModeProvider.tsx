import type { ReactNode } from 'react'
import { dataMode } from '../services'
import { DataModeContext } from './dataMode'

export function DataModeProvider({ children }: { children: ReactNode }) {
  const mode = dataMode()
  return <DataModeContext.Provider value={mode}>{children}</DataModeContext.Provider>
}
