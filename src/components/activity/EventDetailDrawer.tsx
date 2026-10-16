import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getAgent } from '../../data/agents'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import type { ActivityEvent } from '../../types'
import { formatDateTime } from '../../utils/formatDate'
import { ACTIVITY_TYPE_LABEL, EVIDENCE_DESCRIPTION } from '../../utils/labels'
import { AgentChip } from '../shared/AgentChip'
import { Dialog } from '../shared/Dialog'
import { EvidenceBadge } from '../shared/StatusBadge'

interface EventDetailDrawerProps {
  event: ActivityEvent | undefined
  projectName?: string
  onClose: () => void
  /** When inside the project workspace, open the file drawer instead of navigating. */
  onOpenFile?: (fileId: string) => void
}

export function EventDetailDrawer({ event, projectName, onClose, onOpenFile }: EventDetailDrawerProps) {
  const format = useTimeFormat()
  const projectLink = event ? `/app/projects/${event.projectId}${event.taskId ? `?task=${event.taskId}` : ''}` : '/app/projects'

  return (
    <Dialog open={event !== undefined} onClose={onClose} variant="drawer" title={event?.title ?? ''} description={event ? ACTIVITY_TYPE_LABEL[event.type] : undefined}>
      {event && (
        <div className="space-y-5">
          <p className="text-[13px] text-fg">{event.description}</p>

          <dl className="grid grid-cols-2 gap-4 text-[13px]">
            <div>
              <dt className="label-mono text-subtle">When</dt>
              <dd className="text-fg">{format(event.timestamp)}</dd>
              <dd className="text-[11px] text-subtle">{formatDateTime(event.timestamp)}</dd>
            </div>
            <div>
              <dt className="label-mono text-subtle">Agent</dt>
              <dd>{event.agent ? <AgentChip agent={event.agent} /> : <span className="text-muted">Recorded by user</span>}</dd>
            </div>
            <div>
              <dt className="label-mono text-subtle">Project</dt>
              <dd className="text-fg">{projectName ?? event.projectId}</dd>
            </div>
            <div>
              <dt className="label-mono text-subtle">Evidence</dt>
              <dd>
                <EvidenceBadge type={event.evidenceType} />
              </dd>
              <dd className="mt-1 text-[11px] text-subtle">{EVIDENCE_DESCRIPTION[event.evidenceType]}</dd>
            </div>
          </dl>

          <p className="rounded-md border border-dashed border-line-strong p-3 text-[12px] text-muted">
            Demo event from the mock dataset{event.agent ? `; not a real ${getAgent(event.agent).name} session` : ''}.
          </p>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {event.fileId && onOpenFile && (
              <button type="button" onClick={() => onOpenFile(event.fileId ?? '')} className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline">
                Open changed file <ArrowRight className="size-3.5" aria-hidden />
              </button>
            )}
            {event.handoffId && (
              <Link to={`/app/handoffs/${event.handoffId}`} onClick={onClose} className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline">
                Open handoff <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            )}
            {!onOpenFile && (
              <Link
                to={event.fileId ? `${projectLink}${event.taskId ? '&' : '?'}file=${event.fileId}` : projectLink}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline"
              >
                Open in project <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}
