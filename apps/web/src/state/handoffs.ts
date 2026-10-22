import { createContext, useContext } from 'react'
import { dataMode } from '../services'
import { createPersistentStore } from '../services/storage'
import type { Handoff, HandoffDraft, HandoffStatus } from '@continuum/core'
import { INITIAL_HANDOFF_STATE, isHandoffState, type HandoffState } from './handoffStore'

// Local mode keeps its own history with no sample records: the demo's samples point at demo projects.
const IS_LOCAL = dataMode() === 'local'
export const BASELINE_STATE: HandoffState = IS_LOCAL ? { ...INITIAL_HANDOFF_STATE, seedsCleared: true } : INITIAL_HANDOFF_STATE
export const handoffsStore = createPersistentStore<HandoffState>(IS_LOCAL ? 'handoffs.local' : 'handoffs', BASELINE_STATE, isHandoffState)

export interface HandoffsContextValue {
  handoffs: Handoff[]
  createHandoff: (draft: HandoffDraft) => Handoff
  setHandoffStatus: (id: string, status: HandoffStatus) => void
  clearHistory: () => void
  restoreSeedData: () => void
}

export const HandoffsContext = createContext<HandoffsContextValue | null>(null)

export function useHandoffs(): HandoffsContextValue {
  const context = useContext(HandoffsContext)
  if (!context) throw new Error('useHandoffs must be used inside HandoffsProvider')
  return context
}
