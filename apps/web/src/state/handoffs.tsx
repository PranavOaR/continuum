import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { dataMode } from '../services'
import { createPersistentStore } from '../services/storage'
import type { Handoff, HandoffDraft, HandoffStatus } from '@continuum/core'
import {
  INITIAL_HANDOFF_STATE,
  addHandoff,
  createHandoffRecord,
  isHandoffState,
  selectHandoffs,
  updateHandoffStatus,
  type HandoffState,
} from './handoffStore'

// Local mode keeps its own history with no sample records: the demo's samples point at demo projects.
const IS_LOCAL = dataMode() === 'local'
const BASELINE_STATE: HandoffState = IS_LOCAL ? { ...INITIAL_HANDOFF_STATE, seedsCleared: true } : INITIAL_HANDOFF_STATE
const store = createPersistentStore<HandoffState>(IS_LOCAL ? 'handoffs.local' : 'handoffs', BASELINE_STATE, isHandoffState)

interface HandoffsContextValue {
  handoffs: Handoff[]
  createHandoff: (draft: HandoffDraft) => Handoff
  setHandoffStatus: (id: string, status: HandoffStatus) => void
  clearHistory: () => void
  restoreSeedData: () => void
}

const HandoffsContext = createContext<HandoffsContextValue | null>(null)

export function HandoffsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HandoffState>(() => store.load())

  const commit = useCallback((update: (current: HandoffState) => HandoffState) => {
    setState((current) => {
      const next = update(current)
      store.save(next)
      return next
    })
  }, [])

  const createHandoff = useCallback(
    (draft: HandoffDraft) => {
      const handoff = createHandoffRecord(draft)
      commit((current) => addHandoff(current, handoff))
      return handoff
    },
    [commit],
  )

  const setHandoffStatus = useCallback(
    (id: string, status: HandoffStatus) => commit((current) => updateHandoffStatus(current, id, status)),
    [commit],
  )

  const clearHistory = useCallback(() => commit(() => ({ seedsCleared: true, seedStatus: {}, created: [] })), [commit])
  const restoreSeedData = useCallback(() => commit(() => BASELINE_STATE), [commit])

  const handoffs = useMemo(() => selectHandoffs(state), [state])
  const value = useMemo(
    () => ({ handoffs, createHandoff, setHandoffStatus, clearHistory, restoreSeedData }),
    [handoffs, createHandoff, setHandoffStatus, clearHistory, restoreSeedData],
  )
  return <HandoffsContext.Provider value={value}>{children}</HandoffsContext.Provider>
}

export function useHandoffs(): HandoffsContextValue {
  const context = useContext(HandoffsContext)
  if (!context) throw new Error('useHandoffs must be used inside HandoffsProvider')
  return context
}
