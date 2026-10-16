import { ArrowRight, MousePointerClick } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import type { GraphEdge, GraphNode } from '@continuum/core'
import { EmptyState } from '../shared/States'
import { EvidenceBadge } from '../shared/StatusBadge'
import { NODE_TYPE_META } from './graphMeta'

interface MemoryNodeDetailProps {
  node: GraphNode | undefined
  nodes: GraphNode[]
  edges: GraphEdge[]
  onSelect: (id: string) => void
}

export function MemoryNodeDetail({ node, nodes, edges, onSelect }: MemoryNodeDetailProps) {
  const format = useTimeFormat()

  if (!node) {
    return (
      <EmptyState
        icon={<MousePointerClick />}
        title="Select a record"
        description="Choose a node in the graph or list to see its details and relationships."
        className="h-full"
      />
    )
  }

  const meta = NODE_TYPE_META[node.type]
  const Icon = meta.icon
  const related = edges
    .filter((edge) => edge.from === node.id || edge.to === node.id)
    .map((edge) => {
      const otherId = edge.from === node.id ? edge.to : edge.from
      const verb = edge.from === node.id ? `this ${edge.label} →` : `← ${edge.label} this`
      return { edge, other: nodes.find((candidate) => candidate.id === otherId), verb }
    })
    .filter((entry): entry is { edge: GraphEdge; other: GraphNode; verb: string } => entry.other !== undefined)

  return (
    <div className="space-y-4">
      <div>
        <p className={`flex items-center gap-1.5 label-mono ${meta.text}`}>
          <Icon className="size-3.5" aria-hidden />
          {meta.label}
          <span className="font-normal text-subtle normal-case">· {node.subtitle}</span>
        </p>
        <h2 className={`mt-1 text-[15px] font-medium break-words text-fg ${node.type === 'file' || node.type === 'symbol' ? 'font-mono text-[13px]' : ''}`}>
          {node.label}
        </h2>
        <p className="mt-1.5 text-[13px] text-muted">{node.description}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-[12px]">
        <div className="col-span-2">
          <dt className="text-subtle">Source</dt>
          <dd className="font-mono text-[11.5px] break-words text-fg">{node.source}</dd>
        </div>
        <div>
          <dt className="mb-1 text-subtle">Evidence</dt>
          <dd>
            <EvidenceBadge type={node.evidenceType} />
          </dd>
        </div>
        <div>
          <dt className="text-subtle">Last updated</dt>
          <dd className="text-fg">{format(node.updatedAt)}</dd>
        </div>
      </dl>

      <div>
        <h3 className="mb-2 label-mono text-muted ">Related ({related.length})</h3>
        {related.length === 0 ? (
          <p className="text-[12px] text-subtle">No relationships recorded.</p>
        ) : (
          <ul className="space-y-1">
            {related.map(({ edge, other, verb }) => {
              const OtherIcon = NODE_TYPE_META[other.type].icon
              return (
                <li key={edge.id}>
                  <button type="button" onClick={() => onSelect(other.id)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
                    <OtherIcon className={`mt-0.5 size-3.5 shrink-0 ${NODE_TYPE_META[other.type].text}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] text-fg">{other.label}</span>
                      <span className="block text-[11px] text-subtle">{verb}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {node.href && (
        <Link to={node.href} className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline">
          Open in project workspace <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  )
}
