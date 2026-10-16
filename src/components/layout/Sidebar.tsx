import { ArrowRightLeft, FlaskConical } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useProjects } from '../../hooks/useWorkspace'
import { useUI } from '../../state/ui'
import { cn } from '../../utils/cn'
import { Button } from '../shared/Button'
import { Logo } from '../shared/Logo'
import { NAV_ITEMS } from './navItems'

function ProjectLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useProjects()
  const { pathname } = useLocation()
  if (!data) return null

  return (
    <div className="mt-8 border-t border-line pt-6">
      <p className="mb-3 label-mono text-muted">Projects</p>
      <ul className="space-y-0.5">
        {data.map(({ project }) => {
          const isActive = pathname === `/app/projects/${project.id}`
          return (
            <li key={project.id}>
              <Link
                to={`/app/projects/${project.id}`}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={cn('group flex h-8 items-center gap-3 text-[14px]', isActive ? 'text-fg' : 'text-muted hover:text-fg')}
              >
                <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full transition-colors', isActive ? 'bg-accent' : 'bg-line-strong group-hover:bg-subtle')} />
                <span className="truncate">{project.name}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { openHandoffDialog } = useUI()

  return (
    <div className="flex h-full flex-col overflow-y-auto px-7 pt-8 pb-6">
      <Link to="/" onClick={onNavigate} aria-label="Continuum home" className="self-start">
        <Logo />
      </Link>

      <nav aria-label="Primary" className="mt-10">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'relative -mx-3 flex h-9 items-center gap-2.5 rounded-md px-3 text-[14.5px] transition-colors',
                    isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-accent" />}
                    <Icon className={cn('size-4', isActive ? 'text-accent' : 'text-subtle')} aria-hidden />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Button
        variant="primary"
        size="sm"
        icon={<ArrowRightLeft />}
        className="mt-6 self-start"
        onClick={() => {
          onNavigate?.()
          openHandoffDialog()
        }}
      >
        Prepare handoff
      </Button>

      <ProjectLinks onNavigate={onNavigate} />

      <div className="mt-auto pt-8">
        <div className="rounded-lg border border-dashed border-line-strong bg-surface px-3 py-2.5">
          <p className="flex items-center gap-1.5 label-mono text-fg">
            <FlaskConical className="size-3" aria-hidden />
            Demo workspace
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">All data is mock data. No agents, repositories, or files are connected.</p>
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-bg lg:block">
      <SidebarContent />
    </aside>
  )
}
