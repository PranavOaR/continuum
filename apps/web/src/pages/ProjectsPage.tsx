import { FolderGit2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { ProjectCard } from '../components/projects/ProjectCard'
import { Button } from '../components/shared/Button'
import { SearchInput } from '../components/shared/Fields'
import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState, ErrorState, LoadingBlock } from '../components/shared/States'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useProjects } from '../hooks/useWorkspace'
import type { ProjectSummary } from '../services'
import { cn } from '../utils/cn'
import { matchesQuery } from '../utils/search'

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'idle', label: 'Idle' },
] as const

type StatusFilter = (typeof STATUS_FILTERS)[number]['id']

function matchesStatus(summary: ProjectSummary, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'active') return summary.status === 'in-progress' || summary.status === 'blocked'
  return summary.status === filter
}

function parseFilter(value: string | null): StatusFilter {
  return STATUS_FILTERS.find((filter) => filter.id === value)?.id ?? 'all'
}

export function ProjectsPage() {
  useDocumentTitle('Projects')
  const { data, error, isLoading } = useProjects()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const status = parseFilter(params.get('status'))

  const update = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === '' || value === 'all') next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )

  const visible = (data ?? []).filter(
    (summary) => matchesStatus(summary, status) && matchesQuery(query, summary.project.name, summary.project.description, summary.project.stack.join(' ')),
  )

  return (
    <>
      <PageHeader title="Projects" description="Every project Continuum is tracking in this demo." crumbs={[{ label: 'Overview', to: '/app' }, { label: 'Projects' }]} />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={status === filter.id}
              onClick={() => update('status', filter.id)}
              className={cn(
                'h-8 rounded-md px-3 text-[12px] font-medium transition-colors',
                status === filter.id ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <SearchInput value={query} onChange={(value) => update('q', value)} label="Search projects" placeholder="Search projects by name" className="sm:w-72" />
      </div>

      {isLoading && <LoadingBlock rows={3} label="Loading projects" />}
      {error && <ErrorState title="Could not load projects" description={error.message} />}
      {data && data.length === 0 && <EmptyState icon={<FolderGit2 />} title="No projects yet" description="Projects appear here once Continuum starts tracking them." />}
      {data && data.length > 0 && visible.length === 0 && (
        <EmptyState
          title="No projects match"
          description="Try a different name or status filter."
          action={
            <Button size="sm" onClick={() => setParams({}, { replace: true })}>
              Clear filters
            </Button>
          }
        />
      )}
      {visible.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((summary) => (
            <ProjectCard key={summary.project.id} summary={summary} />
          ))}
        </div>
      )}
    </>
  )
}
