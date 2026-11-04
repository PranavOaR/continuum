import { Brain, Compass, History, Landmark, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { MemoryKind, MemoryRecord } from '@continuum/core'
import { MEMORY_KIND_LABEL, MEMORY_SOURCE_LABEL } from '@continuum/core'
import { useProjectEditor } from '../../hooks/useProjectEditor'
import { useIsLive } from '../../state/dataMode'
import { cn } from '../../utils/cn'
import { Panel } from '../shared/Panel'
import { EmptyState } from '../shared/States'
import { EvidenceBadge } from '../shared/StatusBadge'
import { AddMemory, ReviewActions } from './MemoryEditor'

const KIND_ICON: Record<MemoryKind, { icon: LucideIcon; className: string }> = {
  decision: { icon: Landmark, className: 'text-accent' },
  'known-issue': { icon: TriangleAlert, className: 'text-warning' },
  'previous-attempt': { icon: History, className: 'text-muted' },
  'next-action': { icon: Compass, className: 'text-accent' },
}

const KIND_ORDER: MemoryKind[] = ['decision', 'known-issue', 'previous-attempt', 'next-action']

export function MemoryPanel({ records, projectId, taskId }: { records: MemoryRecord[]; projectId: string; taskId?: string }) {
  const isLive = useIsLive()
  const editor = useProjectEditor(projectId)
  // What still applies comes first; resolved records stay visible, and can be reopened.
  const sorted = [...records].sort((a, b) => Number(a.review === 'resolved') - Number(b.review === 'resolved') || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))

  return (
    <Panel
      id="memory"
      title="Project memory"
      description="Persistent knowledge the next agent should respect."
      actions={
        <Link to={`/app/memory?project=${projectId}`} className="text-[12px] text-accent hover:underline">
          Explore
        </Link>
      }
    >
      <div className="space-y-2.5">
        {sorted.length === 0 ? (
          <EmptyState icon={<Brain />} title="No memory records" description="Decisions, known issues and previous attempts will appear here." />
        ) : (
          <ul className="space-y-2.5">
            {sorted.map((record) => {
              const { icon: Icon, className } = KIND_ICON[record.kind]
              const isResolved = record.review === 'resolved'
              return (
                <li key={record.id} className={cn('rounded-md border border-line p-3', isResolved && 'bg-surface-2/60')}>
                  <p className="flex items-center gap-1.5 label-mono text-muted ">
                    <Icon className={`size-3.5 ${className}`} aria-hidden />
                    {MEMORY_KIND_LABEL[record.kind]}
                    {isResolved && <span className="text-subtle">· Resolved</span>}
                  </p>
                  <p className={cn('mt-1.5 text-[13px] font-medium', isResolved ? 'text-muted line-through' : 'text-fg')}>{record.title}</p>
                  <p className="mt-1 text-[12.5px] text-muted">{record.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                    <EvidenceBadge type={record.evidenceType} />
                    <span>Source: {MEMORY_SOURCE_LABEL[record.source]}</span>
                    <span className="font-mono">· {record.sourceDetail}</span>
                  </div>
                  {isLive && (
                    <div className="mt-2">
                      <ReviewActions record={record} editor={editor} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {/* Keyed by task: a draft must not be saved against a task you have since switched to. */}
        {isLive && <AddMemory key={taskId} editor={editor} {...(taskId ? { taskId } : {})} />}
      </div>
    </Panel>
  )
}
