import type { KeyboardEvent } from 'react'
import type { GraphEdge } from '../../types'
import { cn } from '../../utils/cn'
import { NODE_TYPE_META } from './graphMeta'
import { NODE_HEIGHT, NODE_WIDTH, edgePath, type GraphLayout } from './graphLayout'

const MAX_LABEL_CHARS = 21

/** File paths keep their end (the filename); everything else keeps its start. */
function truncate(label: string, keepEnd: boolean): string {
  if (label.length <= MAX_LABEL_CHARS) return label
  return keepEnd ? `…${label.slice(-(MAX_LABEL_CHARS - 1))}` : `${label.slice(0, MAX_LABEL_CHARS - 1)}…`
}

interface MemoryGraphViewProps {
  layout: GraphLayout
  edges: GraphEdge[]
  selectedId: string | null
  matchingIds: Set<string>
  onSelect: (id: string) => void
}

export function MemoryGraphView({ layout, edges, selectedId, matchingIds, onSelect }: MemoryGraphViewProps) {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]))
  const connected = new Set<string>(selectedId ? [selectedId] : [])
  for (const edge of edges) {
    if (edge.from === selectedId) connected.add(edge.to)
    if (edge.to === selectedId) connected.add(edge.from)
  }

  const isNodeEmphasized = (id: string) => (selectedId ? connected.has(id) : matchingIds.has(id))

  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label="Project memory relationship graph" className="h-auto w-full min-w-[860px]">
      <g fill="none">
        {edges.map((edge) => {
          const from = byId.get(edge.from)
          const to = byId.get(edge.to)
          if (!from || !to) return null
          const isActive = selectedId !== null && (edge.from === selectedId || edge.to === selectedId)
          return (
            <path
              key={edge.id}
              d={edgePath(from, to)}
              className={cn('transition-opacity', isActive ? 'stroke-accent opacity-90' : 'stroke-line-strong', selectedId && !isActive ? 'opacity-25' : 'opacity-70')}
              strokeWidth={isActive ? 1.6 : 1}
            >
              <title>{`${from.label} ${edge.label} ${to.label}`}</title>
            </path>
          )
        })}
      </g>

      {layout.nodes.map((node) => {
        const meta = NODE_TYPE_META[node.type]
        const Icon = meta.icon
        const isSelected = node.id === selectedId
        const isSymbol = node.type === 'symbol'
        const handleKey = (event: KeyboardEvent<SVGGElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect(node.id)
          }
        }
        return (
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={`${meta.label}: ${node.label}`}
            aria-pressed={isSelected}
            onClick={() => onSelect(node.id)}
            onKeyDown={handleKey}
            transform={`translate(${node.x} ${node.y})`}
            className={cn('cursor-pointer outline-none transition-opacity [&:focus-visible>rect]:stroke-accent', isNodeEmphasized(node.id) ? 'opacity-100' : 'opacity-35')}
          >
            <title>{node.label}</title>
            <rect
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={isSymbol ? NODE_HEIGHT / 2 : node.type === 'project' ? 8 : 5}
              className={cn('fill-surface', isSelected ? 'stroke-accent' : meta.stroke)}
              strokeWidth={isSelected || node.type === 'project' ? 2 : 1}
              strokeDasharray={node.type === 'session' ? '4 3' : undefined}
            />
            <Icon x={10} y={NODE_HEIGHT / 2 - 7} width={14} height={14} className={meta.text} aria-hidden />
            <text
              x={30}
              y={NODE_HEIGHT / 2 + 4}
              className={cn('fill-fg text-[11.5px]', (node.type === 'file' || isSymbol) && 'font-mono text-[10.5px]')}
            >
              {truncate(node.label, node.type === 'file')}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
