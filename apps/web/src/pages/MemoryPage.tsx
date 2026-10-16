import { Brain, List, Network } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NODE_FILTERS, NODE_TYPE_META, type NodeFilter } from '../components/memory/graphMeta'
import { layoutGraph } from '../components/memory/graphLayout'
import { MemoryGraphView } from '../components/memory/MemoryGraphView'
import { MemoryNodeDetail } from '../components/memory/MemoryNodeDetail'
import { SearchInput, SelectField } from '../components/shared/Fields'
import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState, ErrorState, LoadingBlock } from '../components/shared/States'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useServiceQuery } from '../hooks/useServiceQuery'
import { usePreferredProjectId, useProjects } from '../hooks/useWorkspace'
import { continuumService } from '../services'
import type { GraphNode } from '@continuum/core'
import { cn } from '../utils/cn'
import { matchesQuery } from '../utils/search'
import { useIsLive } from '../state/dataMode'

type View = 'graph' | 'list'

/** Narrow screens default to the list view, which stays readable without zooming. */
function defaultView(): View {
  return window.matchMedia('(max-width: 767px)').matches ? 'list' : 'graph'
}

function NodeList({ nodes, selectedId, onSelect }: { nodes: GraphNode[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (nodes.length === 0) return <EmptyState icon={<Brain />} title="No records match" description="Try another filter or search term." />
  return (
    <ul className="divide-y divide-line">
      {nodes.map((node) => {
        const meta = NODE_TYPE_META[node.type]
        const Icon = meta.icon
        return (
          <li key={node.id}>
            <button
              type="button"
              aria-pressed={node.id === selectedId}
              onClick={() => onSelect(node.id)}
              className={cn('flex w-full items-start gap-3 px-3 py-2.5 text-left', node.id === selectedId ? 'bg-surface-3' : 'hover:bg-surface-2/60')}
            >
              <Icon className={`mt-0.5 size-4 shrink-0 ${meta.text}`} aria-hidden />
              <span className="min-w-0">
                <span className={cn('block text-[13px] break-words text-fg', (node.type === 'file' || node.type === 'symbol') && 'font-mono text-[12px]')}>
                  {node.label}
                </span>
                <span className="block text-[11px] text-subtle">
                  {meta.label} · {node.subtitle}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function MemoryPage() {
  const isLive = useIsLive()
  useDocumentTitle('Memory')
  const projects = useProjects()
  const [params, setParams] = useSearchParams()
  const preferredProjectId = usePreferredProjectId()
  const projectId = params.get('project') ?? preferredProjectId
  const filter = (NODE_FILTERS.find((option) => option.id === params.get('filter'))?.id ?? 'all') as NodeFilter
  const query = params.get('q') ?? ''
  const selectedId = params.get('node')
  const viewParam = params.get('view')
  const view: View = viewParam === 'list' || viewParam === 'graph' ? viewParam : defaultView()
  const graph = useServiceQuery(projectId ? `graph:${projectId}` : null, () => continuumService.getMemoryGraph(projectId as string))

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        Object.entries(changes).forEach(([key, value]) => {
          if (value === null || value === '') next.delete(key)
          else next.set(key, value)
        })
        return next
      },
      { replace: true },
    )

  const layout = useMemo(() => (graph.data ? layoutGraph(graph.data.nodes) : undefined), [graph.data])
  const allowedTypes = NODE_FILTERS.find((option) => option.id === filter)?.types ?? []
  const matching = (graph.data?.nodes ?? []).filter(
    (node) => allowedTypes.includes(node.type) && matchesQuery(query, node.label, node.description),
  )
  const matchingIds = new Set(matching.map((node) => node.id))
  const selectedNode = graph.data?.nodes.find((node) => node.id === selectedId)
  const select = (id: string) => update({ node: id === selectedId ? null : id })

  return (
    <>
      <PageHeader
        title="Memory Explorer"
        description={isLive ? 'How sessions, the files they changed, checks and decisions relate, straight from the local context graph.' : 'How tasks, files, decisions, sessions and checks relate. A fixed sample, derived from the mock dataset.'}
        crumbs={[{ label: 'Overview', to: '/app' }, { label: 'Memory' }]}
      />

      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)] 2xl:grid-cols-[200px_minmax(0,1fr)_300px]">
        <aside className="space-y-4">
          <SelectField label="Project" value={projectId} onChange={(event) => update({ project: event.target.value, node: null })}>
            {(projects.data ?? []).map(({ project }) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </SelectField>
          <SearchInput value={query} onChange={(value) => update({ q: value })} label="Search memory records" placeholder="Search records" />
          <div role="group" aria-label="Filter records by type" className="flex flex-wrap gap-1 lg:flex-col">
            {NODE_FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                onClick={() => update({ filter: option.id === 'all' ? null : option.id })}
                className={cn(
                  'h-8 rounded-md px-2.5 text-left text-[12.5px] font-medium',
                  filter === option.id ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="hidden rounded-lg border border-line p-3 lg:block">
            <p className="mb-2 label-mono text-muted ">Legend</p>
            <ul className="space-y-1.5">
              {Object.entries(NODE_TYPE_META).map(([type, meta]) => (
                <li key={type} className="flex items-center gap-2 text-[12px] text-muted">
                  <meta.icon className={`size-3.5 ${meta.text}`} aria-hidden />
                  {meta.plural}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section aria-label="Relationships" className="min-w-0 rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-[12px] text-muted" aria-live="polite">
              {graph.data ? `${matching.length} of ${graph.data.nodes.length} records` : 'Loading records'}
            </p>
            <div role="group" aria-label="View" className="flex rounded-md border border-line p-0.5">
              {(['graph', 'list'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  onClick={() => update({ view: option })}
                  className={cn('flex h-7 items-center gap-1.5 rounded px-2 text-[12px]', view === option ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}
                >
                  {option === 'graph' ? <Network className="size-3.5" aria-hidden /> : <List className="size-3.5" aria-hidden />}
                  {option === 'graph' ? 'Graph' : 'List'}
                </button>
              ))}
            </div>
          </div>

          {graph.isLoading && (
            <div className="p-4">
              <LoadingBlock rows={4} label="Loading memory graph" />
            </div>
          )}
          {graph.error && (
            <div className="p-4">
              <ErrorState title="Could not load memory" description={graph.error.message} />
            </div>
          )}
          {graph.data && layout && view === 'graph' && (
            <>
              {matching.length === 0 && (
                <p className="border-b border-line px-3 py-2 text-[12px] text-warning">No records match. Showing the full graph dimmed.</p>
              )}
              <div className="overflow-x-auto p-3">
                <MemoryGraphView layout={layout} edges={graph.data.edges} selectedId={selectedId} matchingIds={matchingIds} onSelect={select} />
              </div>
              <p className="border-t border-line px-3 py-2 text-[11px] text-subtle">
                Click or press Enter on a node to inspect it. On small screens the List view is easier to read.
              </p>
            </>
          )}
          {graph.data && view === 'list' && <NodeList nodes={matching} selectedId={selectedId} onSelect={select} />}
        </section>

        <aside className="rounded-lg border border-line bg-surface p-4 lg:col-span-2 2xl:col-span-1" aria-label="Record details">
          <MemoryNodeDetail node={selectedNode} nodes={graph.data?.nodes ?? []} edges={graph.data?.edges ?? []} onSelect={select} />
        </aside>
      </div>
    </>
  )
}
