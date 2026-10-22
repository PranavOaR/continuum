import { ArrowRight, Menu, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '../../utils/cn'
import { buttonClass } from '../shared/buttonClass'
import { Logo } from '../shared/Logo'
import { HOME_SECTIONS, sectionHref } from './siteNav'

const linkClass = (isActive: boolean) =>
  cn('block rounded-full px-3.5 py-1.5 text-[13px] transition-colors', isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg')

/** The website's header. On phones, the links move into a menu. */
export function SiteHeader({ activeId = '' }: { activeId?: string }) {
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const isDocs = pathname.startsWith('/docs')
  // The page the menu was opened on: on any other page (after following a link) it is closed.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null)
  const isMenuOpen = menuOpenOn === pathname
  const setMenuOpen = (isOpen: boolean) => setMenuOpenOn(isOpen ? pathname : null)
  const menuId = useId()

  // Escape closes it too.
  useEffect(() => {
    if (!isMenuOpen) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpenOn(null)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [isMenuOpen])

  const links = [
    ...HOME_SECTIONS.map((section) => ({ key: section.id, label: section.label, href: sectionHref(section.id, isHome), isActive: isHome && activeId === section.id, isRoute: false })),
    { key: 'docs', label: 'Docs', href: '/docs', isActive: isDocs, isRoute: true },
  ]
  const renderLink = (link: (typeof links)[number], className: string) =>
    link.isRoute ? (
      <Link to={link.href} aria-current={link.isActive ? 'page' : undefined} className={className} onClick={() => setMenuOpen(false)}>
        {link.label}
      </Link>
    ) : (
      <a href={link.href} aria-current={link.isActive ? 'location' : undefined} className={className} onClick={() => setMenuOpen(false)}>
        {link.label}
      </a>
    )

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1160px] items-center justify-between gap-4 px-4 sm:px-8">
        <Link to="/" aria-label="Continuum home">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-1 rounded-full border border-line bg-surface p-1 md:flex">
          {links.map((link) => (
            <li key={link.key}>{renderLink(link, linkClass(link.isActive))}</li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <a href={sectionHref('get-started', isHome)} className={buttonClass('primary', 'sm')}>
            Open dashboard <ArrowRight aria-hidden />
          </a>
          <button
            type="button"
            className={buttonClass('ghost', 'sm', 'px-2 md:hidden')}
            aria-expanded={isMenuOpen}
            aria-controls={menuId}
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </div>
      </nav>
      {isMenuOpen && (
        <ul id={menuId} className="border-t border-line px-4 py-3 md:hidden">
          {links.map((link) => (
            <li key={link.key}>{renderLink(link, cn('block rounded-md px-3 py-2.5 text-[15px]', link.isActive ? 'bg-surface-2 text-fg' : 'text-muted'))}</li>
          ))}
        </ul>
      )}
    </header>
  )
}
