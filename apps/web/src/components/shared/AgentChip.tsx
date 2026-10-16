import { getAgent } from '@continuum/core'
import type { AgentType } from '@continuum/core'
import { cn } from '../../utils/cn'

export function AgentMonogram({ agent, className }: { agent: AgentType; className?: string }) {
  const info = getAgent(agent)
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-sm border border-line bg-surface-2 font-mono text-[9px] font-medium text-muted',
        className,
      )}
    >
      {info.monogram}
    </span>
  )
}

export function AgentChip({ agent, className }: { agent: AgentType; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] text-fg', className)}>
      <AgentMonogram agent={agent} />
      {getAgent(agent).name}
    </span>
  )
}
