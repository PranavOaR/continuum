import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-surface-2 text-fg',
  accent: 'border-accent/30 bg-accent/[0.07] text-accent',
  success: 'border-success/30 bg-success/[0.07] text-success',
  warning: 'border-warning/30 bg-warning/[0.07] text-warning',
  danger: 'border-danger/30 bg-danger/[0.07] text-danger',
  muted: 'border-line bg-transparent text-muted',
}

interface BadgeProps {
  tone?: Tone
  icon?: ReactNode
  dashed?: boolean
  title?: string
  className?: string
  children: ReactNode
}

export function Badge({ tone = 'neutral', icon, dashed, title, className, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 font-mono text-[10px] font-medium leading-none tracking-[0.04em] whitespace-nowrap uppercase [&_svg]:size-3 [&_svg]:shrink-0',
        dashed && 'border-dashed',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
