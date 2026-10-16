import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export interface HandoffDialogTarget {
  projectId?: string
  taskId?: string
}

interface UIContextValue {
  handoffDialog: HandoffDialogTarget | null
  openHandoffDialog: (target?: HandoffDialogTarget) => void
  closeHandoffDialog: () => void
  isSearchOpen: boolean
  openSearch: () => void
  closeSearch: () => void
}

const UIContext = createContext<UIContextValue | null>(null)

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

export function useUI(): UIContextValue {
  const context = useContext(UIContext)
  if (!context) throw new Error('useUI must be used inside UIProvider')
  return context
}
