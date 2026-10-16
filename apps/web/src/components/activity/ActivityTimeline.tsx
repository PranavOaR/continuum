import { getAgent } from '@continuum/core'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import type { ActivityEvent } from '@continuum/core'
import { cn } from '../../utils/cn'
import { formatClock } from '../../utils/formatDate'
import { ACTIVITY_TYPE_LABEL } from '@continuum/core'
import { EvidenceBadge } from '../shared/StatusBadge'
import { EVENT_ICON } from './eventMeta'

interface ActivityTimelineProps {
  events: ActivityEvent[]
  onSelect: (eventId: string) => void
  /** Show the clock time column, as in a single-session timeline. */
  showClock?: boolean
  projectNames?: Record<string, string>
}

export function ActivityTimeline({ events, onSelect, showClock = false, projectNames }: ActivityTimelineProps) {
  const format = useTimeFormat()

  return (
    <ol className="relative">
      {events.map((event, index) => {
        const Icon = EVENT_ICON[event.type]
        const isLast = index === events.length - 1
        return (
          <li key={event.id} className="relative">
            {!isLast && <span aria-hidden className={cn('absolute top-10 -bottom-2 w-px bg-line', showClock ? 'left-[83.5px]' : 'left-[15.5px]')} />}
            <button type="button" onClick={() => onSelect(event.id)} className="group flex w-full items-start gap-3 rounded-md py-2 pr-2 text-left hover:bg-surface-2/60">
              {showClock && (
                <time dateTime={event.timestamp} className="w-[52px] shrink-0 pt-1.5 text-right font-mono text-[11px] text-subtle">
                  {formatClock(event.timestamp)}
                </time>
              )}
              <span
                className={cn(
                  'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface',
                  showClock ? 'ml-1' : 'ml-0',
                )}
              >
                <Icon className="size-3.5 text-muted" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-medium text-fg group-hover:text-accent">{event.title}</span>
                  <EvidenceBadge type={event.evidenceType} />
                </span>
                <span className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-muted">
                  <span>{ACTIVITY_TYPE_LABEL[event.type]}</span>
                  {projectNames && <span>· {projectNames[event.projectId] ?? event.projectId}</span>}
                  {event.agent && <span>· {getAgent(event.agent).name}</span>}
                  <span>· {format(event.timestamp)}</span>
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
