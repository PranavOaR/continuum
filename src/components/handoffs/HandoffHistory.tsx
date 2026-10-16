import { ArrowRight, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import type { Handoff, Project, ProjectTask } from '../../types'
import { AgentChip } from '../shared/AgentChip'
import { HandoffStatusBadge } from '../shared/StatusBadge'

interface HandoffHistoryProps {
  handoffs: Handoff[]
  projects: Project[]
  tasks: ProjectTask[]
}

const GRID = 'md:grid-cols-[1fr_1.7fr_1.6fr_0.9fr_0.8fr_16px]'

/** Table-like rows on wide screens, stacked rows on narrow screens. Every row opens the handoff preview. */
export function HandoffHistory({ handoffs, projects, tasks }: HandoffHistoryProps) {
  const format = useTimeFormat()

  return (
    <ul className="divide-y divide-line">
      <li aria-hidden className={`hidden gap-4 px-4 py-2 label-mono text-subtle  md:grid ${GRID}`}>
        <span>Project</span>
        <span>Agents</span>
        <span>Task</span>
        <span>Prepared</span>
        <span>Status</span>
        <span />
      </li>
      {handoffs.map((handoff) => {
        const projectName = projects.find((project) => project.id === handoff.projectId)?.name ?? 'Unknown project'
        const taskTitle = tasks.find((task) => task.id === handoff.taskId)?.title ?? 'Unknown task'
        return (
          <li key={handoff.id}>
            <Link to={`/app/handoffs/${handoff.id}`} className={`group grid gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-surface-2/60 md:items-center ${GRID}`}>
              <span className="text-[13px] font-medium text-fg">{projectName}</span>
              <span className="flex flex-wrap items-center gap-2">
                <AgentChip agent={handoff.sourceAgent} />
                <ArrowRight className="size-3.5 text-subtle" aria-label="to" />
                <AgentChip agent={handoff.targetAgent} />
              </span>
              <span className="text-[13px] text-muted md:truncate">{taskTitle}</span>
              <span className="text-[12px] text-muted">{format(handoff.createdAt)}</span>
              <span>
                <HandoffStatusBadge status={handoff.status} />
              </span>
              <ChevronRight className="hidden size-4 text-subtle group-hover:text-fg md:block" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
