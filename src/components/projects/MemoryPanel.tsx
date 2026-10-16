import { Brain, Compass, History, Landmark, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { MemoryKind, MemoryRecord } from '../../types'
import { MEMORY_KIND_LABEL, MEMORY_SOURCE_LABEL } from '../../utils/labels'
import { Panel } from '../shared/Panel'
import { EmptyState } from '../shared/States'
import { EvidenceBadge } from '../shared/StatusBadge'

const KIND_ICON: Record<MemoryKind, { icon: LucideIcon; className: string }> = {
  decision: { icon: Landmark, className: 'text-accent' },
  'known-issue': { icon: TriangleAlert, className: 'text-warning' },
  'previous-attempt': { icon: History, className: 'text-muted' },
  'next-action': { icon: Compass, className: 'text-accent' },
}

const KIND_ORDER: MemoryKind[] = ['decision', 'known-issue', 'previous-attempt', 'next-action']

export function MemoryPanel({ records, projectId }: { records: MemoryRecord[]; projectId: string }) {
  const sorted = [...records].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))

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
      {sorted.length === 0 ? (
        <EmptyState icon={<Brain />} title="No memory records" description="Decisions, known issues and previous attempts will appear here." />
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((record) => {
            const { icon: Icon, className } = KIND_ICON[record.kind]
            return (
              <li key={record.id} className="rounded-md border border-line p-3">
                <p className="flex items-center gap-1.5 label-mono text-muted ">
                  <Icon className={`size-3.5 ${className}`} aria-hidden />
                  {MEMORY_KIND_LABEL[record.kind]}
                </p>
                <p className="mt-1.5 text-[13px] font-medium text-fg">{record.title}</p>
                <p className="mt-1 text-[12.5px] text-muted">{record.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                  <EvidenceBadge type={record.evidenceType} />
                  <span>Source: {MEMORY_SOURCE_LABEL[record.source]}</span>
                  <span className="font-mono">· {record.sourceDetail}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
