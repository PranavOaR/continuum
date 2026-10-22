import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { UIContext, type HandoffDialogTarget } from './ui'

export function UIProvider({ children }: { children: ReactNode }) {
  const [handoffDialog, setHandoffDialog] = useState<HandoffDialogTarget | null>(null)
  const [isSearchOpen, setSearchOpen] = useState(false)

  const openHandoffDialog = useCallback((target: HandoffDialogTarget = {}) => setHandoffDialog(target), [])
  const closeHandoffDialog = useCallback(() => setHandoffDialog(null), [])
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  const value = useMemo(
    () => ({ handoffDialog, openHandoffDialog, closeHandoffDialog, isSearchOpen, openSearch, closeSearch }),
    [handoffDialog, openHandoffDialog, closeHandoffDialog, isSearchOpen, openSearch, closeSearch],
  )
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}
