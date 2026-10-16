import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../utils/cn'
import { ButtonLink } from '../shared/Button'
import { Logo, LogoMark } from '../shared/Logo'

export interface PageSection {
  id: string
  label: string
}

const DEMO_LINKS = [
  { to: '/app', label: 'Dashboard' },
  { to: '/app/projects/startup-app', label: 'Project workspace' },
  { to: '/app/handoffs', label: 'Handoffs' },
  { to: '/app/memory', label: 'Memory explorer' },
  { to: '/app/activity', label: 'Activity' },
]

export function LandingSidebar({ sections, activeId }: { sections: readonly PageSection[]; activeId: string }) {
  return (
    <div className="sticky top-0 flex h-dvh flex-col overflow-y-auto pt-16 pr-10 pb-8 pl-5">
      <Link to="/" aria-label="Continuum home" className="self-start">
        <Logo />
      </Link>

      <nav aria-label="Main" className="mt-14">
        <ul className="space-y-0.5">
          <li>
            <a href="#product" className="relative flex h-9 items-center text-[15px] text-fg">
              <span aria-hidden className="absolute top-1/2 -left-4 size-1.5 -translate-y-1/2 bg-accent" />
              Home
            </a>
          </li>
          {DEMO_LINKS.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className="group flex h-9 items-center gap-1.5 text-[15px] text-muted hover:text-fg">
                {link.label}
                <ArrowUpRight className="size-3.5 text-subtle group-hover:text-fg" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8 border-t border-dashed border-line-strong pt-7">
        <p className="mb-4 label-mono text-muted">On this page</p>
        <ul className="space-y-1">
          {sections.map((section) => {
            const isActive = section.id === activeId
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={isActive ? 'location' : undefined}
                  className={cn('group flex h-9 items-center gap-4 text-[15px] transition-colors', isActive ? 'font-medium text-fg' : 'text-muted hover:text-fg')}
                >
                  <span aria-hidden className={cn('h-px shrink-0 transition-all', isActive ? 'w-6 bg-accent' : 'w-3 bg-line-strong group-hover:w-4')} />
                  {section.label}
                </a>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="mt-auto pt-10">
        <ButtonLink to="/app" variant="primary" size="sm" icon={<LogoMark onWhite className="size-4" />}>
          Explore the demo
        </ButtonLink>
      </div>
    </div>
  )
}
