import { Activity } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { ActivityTimeline } from '../components/activity/ActivityTimeline'
import { EventDetailDrawer } from '../components/activity/EventDetailDrawer'
import { Button } from '../components/shared/Button'
import { SearchInput, SelectField } from '../components/shared/Fields'
import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState, ErrorState, LoadingBlock } from '../components/shared/States'
import { AGENTS } from '@continuum/core'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useActivityHistory } from '../hooks/useActivityHistory'
import { useServiceQuery } from '../hooks/useServiceQuery'
import { useProjects } from '../hooks/useWorkspace'
import { continuumService } from '../services'
import type { ActivityEvent, ActivityType, AgentType } from '@continuum/core'
import { formatDay } from '../utils/formatDate'
import { ACTIVITY_TYPE_LABEL } from '@continuum/core'
import { matchesQuery } from '../utils/search'
import { useIsLive } from '../state/dataMode'

const FILTER_KEYS = ['project', 'type', 'agent', 'q', 'from', 'to'] as const
const DATE_FIELD = 'h-9 w-full rounded-md border border-line bg-surface px-3 text-[13px] text-fg focus:border-accent focus:outline-none'

/** A day picked in the browser as the instant it starts (or, for an end date, the instant the next day starts) in local time. */
function dayBoundary(day: string, isEnd: boolean): string | undefined {
  const start = new Date(`${day}T00:00:00`)
  if (day === '' || Number.isNaN(start.getTime())) return undefined
  if (isEnd) start.setDate(start.getDate() + 1)
  return start.toISOString()
}

function groupByDay(events: ActivityEvent[]): Array<{ day: string; events: ActivityEvent[] }> {
  return events.reduce<Array<{ day: string; events: ActivityEvent[] }>>((groups, event) => {
    const day = formatDay(event.timestamp)
    const last = groups[groups.length - 1]
    if (last && last.day === day) return [...groups.slice(0, -1), { day, events: [...last.events, event] }]
    return [...groups, { day, events: [event] }]
  }, [])
}

export function ActivityPage() {
  const isLive = useIsLive()
  useDocumentTitle('Activity')
  const activity = useServiceQuery('activity', () => continuumService.listActivity())
  const projects = useProjects()
  const [params, setParams] = useSearchParams()

  const filters = {
    project: params.get('project') ?? '',
    type: params.get('type') ?? '',
    agent: params.get('agent') ?? '',
    q: params.get('q') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  }
  // With one project chosen, its whole history is read a page at a time, filtered where it is read.
  const isPaged = filters.project !== ''
  const from = dayBoundary(filters.from, false)
  const to = dayBoundary(filters.to, true)
  const history = useActivityHistory(isPaged ? filters.project : null, {
    ...(filters.type ? { type: filters.type as ActivityType } : {}),
    ...(filters.agent ? { agent: filters.agent as AgentType } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  })
  const hasFilters = FILTER_KEYS.some((key) => filters[key] !== '')

  const update = (changes: Record<string, string>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        Object.entries(changes).forEach(([key, value]) => {
          if (value === '') next.delete(key)
          else next.set(key, value)
        })
        return next
      },
      { replace: true },
    )

  const projectNames = Object.fromEntries((projects.data ?? []).map(({ project }) => [project.id, project.name]))
  const loaded = isPaged ? history.events : (activity.data ?? [])
  const events = loaded.filter(
    (event) =>
      (isPaged || ((filters.type === '' || event.type === filters.type) && (filters.agent === '' || event.agent === filters.agent))) &&
      matchesQuery(filters.q, event.title, event.description),
  )
  const isLoading = isPaged ? history.isLoading && history.events.length === 0 : activity.isLoading
  const error = isPaged ? history.error : activity.error
  const isReady = isPaged ? !history.isLoading || history.events.length > 0 : activity.data !== undefined
  const selectedEvent = [...loaded, ...(activity.data ?? [])].find((event) => event.id === params.get('event'))

  return (
    <>
      <PageHeader
        title="Activity"
        description={isLive ? 'A cross-project timeline of recorded work: agent sessions, file changes, checks and decisions.' : 'A cross-project timeline of recorded work. All events are mock data.'}
        crumbs={[{ label: 'Overview', to: '/app' }, { label: 'Activity' }]}
      />

      <div className="mb-5 grid gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="activity-search" className="text-[12px] font-medium text-muted">
            Search
          </label>
          <SearchInput id="activity-search" value={filters.q} onChange={(q) => update({ q })} label="Search activity" placeholder="Search events" />
        </div>
        <SelectField label="Project" value={filters.project} onChange={(event) => update({ project: event.target.value })}>
          <option value="">All projects</option>
          {(projects.data ?? []).map(({ project }) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Event type" value={filters.type} onChange={(event) => update({ type: event.target.value })}>
          <option value="">All types</option>
          {(Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[]).map((type) => (
            <option key={type} value={type}>
              {ACTIVITY_TYPE_LABEL[type]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Agent" value={filters.agent} onChange={(event) => update({ agent: event.target.value })}>
          <option value="">All agents</option>
          {AGENTS.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </SelectField>
      </div>

      {isPaged && (
        <div className="mb-5 grid gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="activity-from" className="label-mono text-subtle">
              From
            </label>
            <input id="activity-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => update({ from: event.target.value })} className={DATE_FIELD} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="activity-to" className="label-mono text-subtle">
              To
            </label>
            <input id="activity-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => update({ to: event.target.value })} className={DATE_FIELD} />
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between text-[12px] text-muted">
        <span aria-live="polite">
          {!isReady ? 'Loading events' : isPaged ? `${events.length} event${events.length === 1 ? '' : 's'}${history.hasOlder ? ', with older ones to load' : ', back to the first recorded'}` : `${events.length} of ${loaded.length} events`}
        </span>
        {!isPaged && isReady && <span className="hidden sm:inline">The most recent events. Choose a project to read its whole history.</span>}
        {hasFilters && (
          <Button size="sm" variant="ghost" onClick={() => update({ project: '', type: '', agent: '', q: '', from: '', to: '' })}>
            Clear filters
          </Button>
        )}
      </div>

      {isLoading && <LoadingBlock rows={5} label="Loading activity" />}
      {error && <ErrorState title="Could not load activity" description={error.message} />}
      {isReady && !error && events.length === 0 && !(isPaged && history.hasOlder) && (
        <EmptyState icon={<Activity />} title="No activity matches these filters" description="Try another project, event type, or agent." />
      )}
      {events.length > 0 && (
        <div className="space-y-6">
          {groupByDay(events).map((group) => (
            <section key={group.day} aria-label={group.day}>
              <h2 className="mb-2 label-mono text-muted">{group.day}</h2>
              <div className="rounded-lg border border-line bg-surface px-3 py-2">
                <ActivityTimeline events={group.events} projectNames={projectNames} onSelect={(event) => update({ event })} />
              </div>
            </section>
          ))}
        </div>
      )}

      {isPaged && history.hasOlder && (
        <div className="mt-6 flex justify-center">
          <Button size="sm" onClick={history.loadOlder} disabled={history.isLoading}>
            {history.isLoading ? 'Loading older events' : 'Load older events'}
          </Button>
        </div>
      )}

      <EventDetailDrawer event={selectedEvent} projectName={selectedEvent ? projectNames[selectedEvent.projectId] : undefined} onClose={() => update({ event: '' })} />
    </>
  )
}
