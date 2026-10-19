import { Link, useLocation } from 'react-router-dom'
import { Logo } from '../shared/Logo'
import { NPM_URL } from './siteContent'
import { sectionHref } from './siteNav'

export function SiteFooter() {
  const isHome = useLocation().pathname === '/'
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Logo />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
          <a href={sectionHref('demo', isHome)} className="hover:text-fg">Demo</a>
          <a href={sectionHref('get-started', isHome)} className="hover:text-fg">Get started</a>
          <Link to="/docs" className="hover:text-fg">Docs</Link>
          <Link to="/privacy" className="hover:text-fg">Privacy</Link>
          <a href={NPM_URL} target="_blank" rel="noreferrer" className="hover:text-fg">
            npm<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
        <p className="text-[12px] text-subtle">MIT licensed · runs on your machine</p>
      </div>
    </footer>
  )
}
