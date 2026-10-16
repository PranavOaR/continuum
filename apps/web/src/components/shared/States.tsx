import { CircleAlert, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('cn-dots flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-10 text-center', className)}>
      <div className="mb-3 flex size-9 items-center justify-center rounded-md border border-line bg-surface-2 text-muted [&_svg]:size-4">
        {icon ?? <Inbox />}
      </div>
      <p className="text-[15px] font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-lg border border-danger/30 bg-danger/5 px-6 py-10 text-center">
      <CircleAlert className="mb-3 size-5 text-danger" aria-hidden />
      <p className="text-[14px] font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-md text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('cn-skeleton rounded-md', className)} />
}

export function LoadingBlock({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  )
}
