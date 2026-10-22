import { createContext, useContext } from 'react'

export interface HandoffDialogTarget {
  projectId?: string
  taskId?: string
}

export interface UIContextValue {
  handoffDialog: HandoffDialogTarget | null
  openHandoffDialog: (target?: HandoffDialogTarget) => void
  closeHandoffDialog: () => void
  isSearchOpen: boolean
  openSearch: () => void
  closeSearch: () => void
}

export const UIContext = createContext<UIContextValue | null>(null)

export function useUI(): UIContextValue {
  const context = useContext(UIContext)
  if (!context) throw new Error('useUI must be used inside UIProvider')
  return context
}
