import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useUI } from '../../state/ui'
import { HandoffDialog } from '../handoffs/HandoffDialog'
import { LoadingBlock } from '../shared/States'
import { MobileNav } from './MobileNav'
import { SearchDialog } from './SearchDialog'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell() {
  const [isNavOpen, setNavOpen] = useState(false)
  const { openSearch } = useUI()
  const { pathname } = useLocation()

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openSearch()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [openSearch])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="min-h-dvh bg-bg">
      <a href="#main" className="sr-only z-50 rounded bg-accent-strong px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <Sidebar />
      <MobileNav open={isNavOpen} onClose={() => setNavOpen(false)} />
      <div className="lg:pl-64">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
          <Suspense fallback={<LoadingBlock rows={4} label="Loading page" />}>
            <div key={pathname} className="cn-page">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
      <SearchDialog />
      <HandoffDialog />
    </div>
  )
}
