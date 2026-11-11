import { FilePen, FlaskConical, History, Lightbulb, ListChecks, MessageSquareText, TriangleAlert, Users, type LucideIcon } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { AGENTS, type AgentType, type ReplayStep } from '@continuum/core'
import { Badge } from '../components/shared/Badge'
import { AgentChip } from '../components/shared/AgentChip'
import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState, ErrorState, LoadingBlock } from '../components/shared/States'
import { EvidenceBadge } from '../components/shared/StatusBadge'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useServiceQuery } from '../hooks/useServiceQuery'
import { useProjects } from '../hooks/useWorkspace'
import { continuumService } from '../services'
import { cn } from '../utils/cn'
import { formatClock, formatDay } from '../utils/formatDate'

const KIND: Record<ReplayStep['kind'], { icon: LucideIcon; label: string }> = {
  task: { icon: ListChecks, label: 'Task' },
  session: { icon: Users, label: 'Session' },
  note: { icon: MessageSquareText, label: 'Note' },
  edit: { icon: FilePen, label: 'Edit' },
  check: { icon: FlaskConical, label: 'Check' },
  decision: { icon: Lightbulb, label: 'Decision' },
  stale: { icon: TriangleAlert, label: 'Went stale' },
}

/** A coloured edge for steps that change whether the work can be trusted. */
const TONE_EDGE: Record<NonNullable<ReplayStep['tone']>, string> = {
  good: 'border-l-success',
  bad: 'border-l-danger',
  warn: 'border-l-warning',
}

const KNOWN_AGENTS = new Set<string>(AGENTS.map((agent) => agent.id))

/** `npm test` in a detail line reads as code. */
function Detail({ text }: { text: string }) {
  if (!text) return null
  const parts = text.split(/(`[^`]+`)/)
  return (
    <p className="text-[13px] break-words text-muted">
      {parts.map((part, index) => (part.startsWith('`') && part.endsWith('`') ? <code key={index} className="font-mono text-[12px] text-fg">{part.slice(1, -1)}</code> : part))}
    </p>
  )
}

function Step({ step }: { step: ReplayStep }) {
  const { icon: Icon, label } = KIND[step.kind]
  return (
    <li className={cn('flex gap-3 border-l-2 py-3 pr-2 pl-3', step.tone ? TONE_EDGE[step.tone] : 'border-l-line')}>
      <time dateTime={step.at} className="w-12 shrink-0 pt-0.5 font-mono text-[12px] text-subtle tabular-nums">
        {formatClock(step.at)}
      </time>
      <Icon className={cn('mt-0.5 size-4 shrink-0', step.kind === 'stale' ? 'text-warning' : 'text-subtle')} aria-label={label} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[14px] font-medium break-words text-fg">{step.title}</p>
        <Detail text={step.detail} />
        <div className="flex flex-wrap items-center gap-2">
          {step.agent && KNOWN_AGENTS.has(step.agent) && <AgentChip agent={step.agent as AgentType} />}
          <EvidenceBadge type={step.evidence} />
        </div>
      </div>
    </li>
  )
}

/** Steps under the day they happened, oldest first. */
function byDay(steps: readonly ReplayStep[]): { day: string; steps: ReplayStep[] }[] {
  return steps.reduce<{ day: string; steps: ReplayStep[] }[]>((groups, step) => {
    const day = formatDay(step.at)
    const last = groups.at(-1)
    return last && last.day === day ? [...groups.slice(0, -1), { day, steps: [...last.steps, step] }] : [...groups, { day, steps: [step] }]
  }, [])
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

/**
 * One task's whole history across agents and people: who worked on it, what
 * changed, which checks ran, and the moment a passing check stopped holding.
 */
export function TaskReplayPage() {
  const { projectId = '', taskId = '' } = useParams()
  const replay = useServiceQuery(`replay:${projectId}:${taskId}`, () => continuumService.getTaskReplay(projectId, taskId))
  const projects = useProjects()
  const projectName = projects.data?.find(({ project }) => project.id === projectId)?.project.name ?? projectId
  useDocumentTitle(replay.data ? `Replay: ${replay.data.title}` : 'Task replay')
  const projectLink = `/app/projects/${encodeURIComponent(projectId)}?task=${encodeURIComponent(taskId)}`

  return (
    <>
      <PageHeader
        title={replay.data?.title ?? 'Task replay'}
        description="Everything recorded for this task, across agents and people, oldest first."
        crumbs={[{ label: 'Projects', to: '/app/projects' }, { label: projectName, to: projectLink }, { label: 'Replay' }]}
      />
      {replay.isLoading && <LoadingBlock rows={6} label="Loading the task's history" />}
      {replay.error && <ErrorState title="Could not load this task's history" description={replay.error.message} action={<Link to={projectLink} className="text-accent underline">Back to the project</Link>} />}
      {replay.data && (
        <div className="space-y-6">
          <section aria-label="Summary" className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{replay.data.status.replace('-', ' ')}</Badge>
            {replay.data.summary.agents.filter((agent) => KNOWN_AGENTS.has(agent)).map((agent) => <AgentChip key={agent} agent={agent as AgentType} />)}
            <Badge tone="muted">{plural(replay.data.summary.edits, 'edit')}</Badge>
            <Badge tone="muted">{plural(replay.data.summary.checks, 'check run')}</Badge>
            <Badge tone="muted">{plural(replay.data.summary.decisions, 'decision')}</Badge>
            {replay.data.summary.stale > 0 && <Badge tone="warning" icon={<TriangleAlert />}>{`A check went stale ${replay.data.summary.stale === 1 ? 'once' : `${replay.data.summary.stale} times`}`}</Badge>}
          </section>
          {replay.data.isPartial && <p className="text-[13px] text-muted">Older history was folded into a checkpoint by <code className="font-mono">continuum compact</code>, so this replay may start partway through.</p>}
          {replay.data.steps.length === 0 ? (
            <EmptyState icon={<History />} title="Nothing recorded for this task yet" description="Its sessions, edits and checks appear here as agents work on it." />
          ) : (
            byDay(replay.data.steps).map((group) => (
              <section key={group.day} aria-label={group.day}>
                <h2 className="mb-2 label-mono text-muted">{group.day}</h2>
                <ol className="rounded-lg border border-line bg-surface px-2">{group.steps.map((step, index) => <Step key={`${step.at}-${index}`} step={step} />)}</ol>
              </section>
            ))
          )}
        </div>
      )}
    </>
  )
}
