import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface PanelProps {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  id?: string
  className?: string
  bodyClassName?: string
  children: ReactNode
}

/** The standard hairline-bordered surface: a medium-weight title over a mono caption. */
export function Panel({ title, description, actions, id, className, bodyClassName, children }: PanelProps) {
  const headingId = id ? `${id}-heading` : undefined
  return (
    <section id={id} aria-labelledby={headingId} className={cn('scroll-mt-20 border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 id={headingId} className="text-[15px] font-medium tracking-[-0.01em] text-fg">
                {title}
              </h2>
            )}
            {description && <p className="mt-1 label-mono text-subtle">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}
