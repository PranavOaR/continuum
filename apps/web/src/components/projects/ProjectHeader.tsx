import { Activity, ArrowRightLeft, Brain, Copy, Ellipsis, GitBranch, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import { useToast } from '../../state/toasts'
import { useUI } from '../../state/ui'
import type { Project, ProjectStatus } from '@continuum/core'
import { copyToClipboard } from '../../utils/clipboard'
import { AgentChip } from '../shared/AgentChip'
import { Breadcrumbs } from '../shared/Breadcrumbs'
import { Button, ButtonLink, IconButton } from '../shared/Button'
import { Popover, PopoverItem } from '../shared/Popover'
import { TaskStatusBadge } from '../shared/StatusBadge'

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label-mono text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-fg">{children}</dd>
    </div>
  )
}

export function ProjectHeader({ project, status, taskId }: { project: Project; status: ProjectStatus; taskId?: string }) {
  const { openHandoffDialog } = useUI()
  const notify = useToast()
  const navigate = useNavigate()
  const format = useTimeFormat()

  const go = (close: () => void, to: string) => {
    close()
    navigate(to)
  }

  const copyBranch = async () => {
    const result = await copyToClipboard(project.branch)
    notify(result.ok ? `Copied branch name ${project.branch}` : `Could not copy: ${result.reason}`, result.ok ? 'success' : 'error')
  }

  return (
    <div className="mb-6">
      <Breadcrumbs items={[{ label: 'Projects', to: '/app/projects' }, { label: project.name }]} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[30px] leading-[1.12] font-normal tracking-display text-fg sm:text-[36px]">{project.name}</h1>
            <TaskStatusBadge status={status} />
          </div>
          <p className="mt-1 max-w-2xl text-[14px] text-muted">{project.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink to={`/app/activity?project=${project.id}`} icon={<Activity />} size="sm">
            View Activity
          </ButtonLink>
          <Button variant="primary" size="sm" icon={<ArrowRightLeft />} onClick={() => openHandoffDialog({ projectId: project.id, taskId })}>
            Prepare Handoff
          </Button>
          <Popover
            className="w-56"
            trigger={(props) => (
              <IconButton label="Project options" className="border border-line-strong" {...props}>
                <Ellipsis aria-hidden />
              </IconButton>
            )}
          >
            {(close) => (
              <>
                <PopoverItem icon={<Brain />} onClick={() => go(close, `/app/memory?project=${project.id}`)}>
                  Open in Memory Explorer
                </PopoverItem>
                <PopoverItem icon={<Copy />} onClick={() => {
                    close()
                    void copyBranch()
                  }}>
                  Copy branch name
                </PopoverItem>
                <PopoverItem icon={<Settings />} onClick={() => go(close, '/app/settings')}>
                  Workspace settings
                </PopoverItem>
              </>
            )}
          </Popover>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-line bg-surface px-4 py-3 sm:grid-cols-3 lg:grid-cols-5">
        <Meta label="Repository">
          <span className="font-mono text-[12px]">{project.repositoryName}</span>
        </Meta>
        <Meta label="Branch">
          <span className="inline-flex items-center gap-1 font-mono text-[12px]">
            <GitBranch className="size-3.5 text-muted" aria-hidden />
            {project.branch}
          </span>
        </Meta>
        <Meta label="Stack">{project.stack.join(', ')}</Meta>
        <Meta label="Last active agent">
          <AgentChip agent={project.lastActiveAgent} />
        </Meta>
        <Meta label="Last updated">{format(project.updatedAt)}</Meta>
      </dl>
      <p className="mt-2 text-[11px] text-subtle">Illustrative metadata from the demo dataset. No repository is connected.</p>
    </div>
  )
}
