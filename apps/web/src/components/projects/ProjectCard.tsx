import { Clock, GitBranch } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getAgent } from '@continuum/core'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import type { ProjectSummary } from '../../services'
import { cn } from '../../utils/cn'
import { AgentChip } from '../shared/AgentChip'
import { TaskStatusBadge } from '../shared/StatusBadge'

/** Segmented progress: one block per item, filled in the accent colour when done. */
export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between label-mono text-subtle">
        <span>{label}</span>
        <span className="text-fg">
          {done}/{total}
        </span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="flex gap-0.5">
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={cn('h-1.5 flex-1 rounded-full', index < done ? 'bg-accent' : 'bg-surface-3')} />
        ))}
      </div>
    </div>
  )
}

/** With no task, the card shows the latest session's own words, so recent work is visible without one. */
function LatestSessionNote({ session }: { session: ProjectSummary['latestSession'] }) {
  const format = useTimeFormat()
  if (!session) {
    return (
      <>
        <p className="label-mono text-subtle">Latest session</p>
        <p className="mt-1 text-[14px] text-muted">No agent session yet. Start one in this repository and it appears here.</p>
      </>
    )
  }
  return (
    <>
      <p className="label-mono text-subtle">
        Latest session · {getAgent(session.agent).name} · {format(session.lastActivityAt)}
      </p>
      <p className="mt-1 line-clamp-2 text-[14px] text-fg">{session.note ?? 'No note recorded.'}</p>
    </>
  )
}

export function ProjectCard({ summary }: { summary: ProjectSummary }) {
  const { project, currentTask, latestSession, status, progress } = summary
  const format = useTimeFormat()

  return (
    <Link
      to={`/app/projects/${project.id}`}
      className="cn-thread group flex h-full flex-col rounded-lg border border-line bg-surface p-5 shadow-card transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[18px] font-normal tracking-[-0.02em] text-fg group-hover:text-accent">{project.name}</h3>
          <p className="mt-1 line-clamp-2 text-[13.5px] text-muted">{project.description}</p>
        </div>
        <TaskStatusBadge status={status} />
      </div>

      <p className="mt-3 label-mono text-subtle">{project.stack.join(' · ')}</p>

      <div className="mt-5 border-t border-dashed border-line-strong pt-4">
        {currentTask ? (
          <>
            <p className="label-mono text-subtle">Current task</p>
            <p className="mt-1 text-[14px] font-medium text-fg">{currentTask.title}</p>
            {progress.total > 0 && (
              <div className="mt-3">
                <ProgressBar done={progress.done} total={progress.total} label="Criteria complete" />
              </div>
            )}
          </>
        ) : (
          <LatestSessionNote session={latestSession} />
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5 text-[12px] text-muted">
        {project.lastActiveAgent && <AgentChip agent={project.lastActiveAgent} className="text-[12px]" />}
        <span className="flex items-center gap-1 font-mono text-[11px]">
          <GitBranch className="size-3.5" aria-hidden />
          {project.branch}
        </span>
        <span className="ml-auto flex items-center gap-1 font-mono text-[11px]">
          <Clock className="size-3.5" aria-hidden />
          {format(project.updatedAt)}
        </span>
      </div>
    </Link>
  )
}
