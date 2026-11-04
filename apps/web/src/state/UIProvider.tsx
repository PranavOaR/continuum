import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { UIContext } from './ui'

export function UIProvider({ children }: { children: ReactNode }) {
  const [isSearchOpen, setSearchOpen] = useState(false)

  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  const value = useMemo(() => ({ isSearchOpen, openSearch, closeSearch }), [isSearchOpen, openSearch, closeSearch])
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}
