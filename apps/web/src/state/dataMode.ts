import { createContext, useContext } from 'react'
import type { DataMode } from '../services'

export const DataModeContext = createContext<DataMode>('demo')

/** Whether screens show live local data or the demo dataset; labels must say which. */
export function useDataMode(): DataMode {
  return useContext(DataModeContext)
}

/** True for live local data, false for the demo dataset. */
export function useIsLive(): boolean {
  return useDataMode() === 'local'
}
