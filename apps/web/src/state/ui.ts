import { createContext, useContext } from 'react'

export interface UIContextValue {
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
