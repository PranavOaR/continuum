import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { HandoffDraft, HandoffStatus } from '@continuum/core'
import { addHandoff, createHandoffRecord, selectHandoffs, updateHandoffStatus, type HandoffState } from './handoffStore'
import { BASELINE_STATE, HandoffsContext, handoffsStore } from './handoffs'

export function HandoffsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HandoffState>(() => handoffsStore.load())

  const commit = useCallback((update: (current: HandoffState) => HandoffState) => {
    setState((current) => {
      const next = update(current)
      handoffsStore.save(next)
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
