import { ArrowRightLeft, Info } from 'lucide-react'
import { useState } from 'react'
import { HandoffHistory } from '../components/handoffs/HandoffHistory'
import { Button } from '../components/shared/Button'
import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState, ErrorState, LoadingBlock } from '../components/shared/States'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useProjects, useTasks } from '../hooks/useWorkspace'
import { useHandoffs } from '../state/handoffs'
import { useUI } from '../state/ui'
import type { HandoffStatus } from '../types'
import { cn } from '../utils/cn'
import { HANDOFF_STATUS_LABEL } from '../utils/labels'

type Filter = 'all' | HandoffStatus

export function HandoffsPage() {
  useDocumentTitle('Handoffs')
  const { handoffs } = useHandoffs()
  const { openHandoffDialog } = useUI()
  const projects = useProjects()
  const tasks = useTasks()
  const [filter, setFilter] = useState<Filter>('all')

  const visible = handoffs.filter((handoff) => filter === 'all' || handoff.status === filter)
  const filters: Filter[] = ['all', 'draft', 'prepared', 'copied']
  const error = projects.error ?? tasks.error

  return (
    <>
      <PageHeader
        title="Handoffs"
        description="Context packages prepared for moving work between agents."
        crumbs={[{ label: 'Overview', to: '/app' }, { label: 'Handoffs' }]}
        actions={
          <Button variant="primary" size="sm" icon={<ArrowRightLeft />} onClick={() => openHandoffDialog()}>
            Prepare Handoff
          </Button>
        }
      />

      <p className="mb-5 flex gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-[12px] text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Handoffs are simulated. Preparing one builds a text package you can copy; nothing is delivered to any agent.
      </p>

      <div role="group" aria-label="Filter by status" className="mb-3 flex flex-wrap gap-1">
        {filters.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
            className={cn('h-8 rounded-md px-3 text-[12px] font-medium', filter === option ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
          >
            {option === 'all' ? 'All' : HANDOFF_STATUS_LABEL[option]}
            <span className="ml-1.5 text-subtle">{option === 'all' ? handoffs.length : handoffs.filter((h) => h.status === option).length}</span>
          </button>
        ))}
      </div>

      {error && <ErrorState title="Could not load handoff details" description={error.message} />}
      {!error && (projects.isLoading || tasks.isLoading) && <LoadingBlock rows={3} label="Loading handoffs" />}
      {projects.data && tasks.data && (
        <>
          {handoffs.length === 0 ? (
            <EmptyState
              icon={<ArrowRightLeft />}
              title="No handoffs yet"
              description="Prepare a handoff from a project to package its current state for another agent."
              action={
                <Button variant="primary" size="sm" onClick={() => openHandoffDialog()}>
                  Prepare your first handoff
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState title={`No ${HANDOFF_STATUS_LABEL[filter as HandoffStatus].toLowerCase()} handoffs`} description="Choose another status filter." />
          ) : (
            <div className="rounded-lg border border-line bg-surface">
              <HandoffHistory handoffs={visible} projects={projects.data.map((summary) => summary.project)} tasks={tasks.data} />
            </div>
          )}
        </>
      )}
    </>
  )
}
