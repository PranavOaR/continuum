import { ArrowRight, ArrowRightLeft, FileCode2, FolderGit2, FolderOpen, ListChecks, Search, type LucideIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { ActivityTimeline } from '../components/activity/ActivityTimeline'
import { ProjectCard } from '../components/projects/ProjectCard'
import { AttentionList } from '../components/shared/AttentionList'
import { Button, ButtonLink } from '../components/shared/Button'
import { PageHeader } from '../components/shared/PageHeader'
import { Panel } from '../components/shared/Panel'
import { EmptyState, ErrorState, LoadingBlock, Skeleton } from '../components/shared/States'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAttentionItems, useOverviewQuery } from '../hooks/useOverview'
import { useHandoffs } from '../state/handoffs'
import { useUI } from '../state/ui'
import { usePreferredProjectId } from '../hooks/useWorkspace'

interface SummaryCardProps {
  label: string
  value: number
  hint: string
  icon: LucideIcon
  to: string
}

function SummaryCard({ label, value, hint, icon: Icon, to }: SummaryCardProps) {
  return (
    <Link to={to} className="cn-thread group flex flex-col rounded-lg border border-line bg-surface px-4 pt-4 pb-4 shadow-card transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised sm:px-5 sm:pt-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[15px] font-medium tracking-[-0.01em] text-fg">{label}</p>
        <Icon className="size-4 text-subtle transition-colors group-hover:text-accent" aria-hidden />
      </div>
      {/* On a phone the label says enough; the hint would wrap word by word. */}
      <p className="mt-1 hidden label-mono text-subtle sm:block">{hint}</p>
      <p className="mt-4 text-[36px] leading-none font-normal tracking-display text-fg tabular-nums sm:mt-5 sm:text-[44px]">{value}</p>
    </Link>
  )
}

export function OverviewPage() {
  useDocumentTitle('Overview')
  const { data, error, isLoading } = useOverviewQuery()
  const { items: attention } = useAttentionItems()
  const { handoffs } = useHandoffs()
  const preferredProjectId = usePreferredProjectId()
  const { openSearch } = useUI()
  const navigate = useNavigate()

  const header = (
    <PageHeader
      title="Overview"
      description="Here's where your projects stand."
      actions={
        <>
          <Button size="sm" icon={<Search />} onClick={openSearch}>
            Search
          </Button>
          <ButtonLink to={preferredProjectId ? `/app/projects/${preferredProjectId}` : '/app/projects'} variant="primary" size="sm" icon={<FolderOpen />}>
            Open Project
          </ButtonLink>
        </>
      }
    />
  )

  if (isLoading) {
    return (
      <>
        {header}
        <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[150px]" />
          ))}
        </div>
        <LoadingBlock rows={3} label="Loading overview" />
      </>
    )
  }
  if (error || !data) return <ErrorState title="Could not load the overview" description={error?.message} />

  const activeProjects = data.projects.filter((summary) => summary.status !== 'idle' && summary.status !== 'completed')
  const pendingHandoffs = handoffs.filter((handoff) => handoff.status !== 'copied').length
  const projectNames = Object.fromEntries(data.projects.map(({ project }) => [project.id, project.name]))

  return (
    <>
      {header}

      <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Active projects" value={activeProjects.length} hint="In progress or blocked" icon={FolderGit2} to="/app/projects?status=active" />
        <SummaryCard label="Active tasks" value={data.activeTaskCount} hint="Not yet completed" icon={ListChecks} to="/app/projects" />
        <SummaryCard label="Recent changes" value={data.changedFileCount} hint="Files across active tasks" icon={FileCode2} to="/app/activity?type=file-change" />
        <SummaryCard label="Pending handoffs" value={pendingHandoffs} hint="Not yet copied" icon={ArrowRightLeft} to="/app/handoffs" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="active-projects-heading" className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="active-projects-heading" className="text-[22px] font-normal tracking-[-0.02em] text-fg">
              Active projects
            </h2>
            <Link to="/app/projects" className="inline-flex items-center gap-1 text-[13px] font-medium text-fg hover:text-accent">
              All projects <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {activeProjects.length === 0 ? (
            <EmptyState icon={<FolderGit2 />} title="No active projects" description="Projects with work in progress will appear here." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {activeProjects.map((summary) => (
                <ProjectCard key={summary.project.id} summary={summary} />
              ))}
            </div>
          )}
        </section>

        <div className="min-w-0 space-y-6">
          <Panel title="Attention required" description={`${attention.length} items across your projects`} bodyClassName="px-3 py-1">
            {attention.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted">Nothing needs attention.</p>
            ) : (
              <AttentionList items={attention} />
            )}
          </Panel>

          <Panel
            title="Recent activity"
            actions={
              <Link to="/app/activity" className="text-[12px] text-accent hover:underline">
                View all
              </Link>
            }
            bodyClassName="px-3 py-2"
          >
            <ActivityTimeline events={data.recentEvents} projectNames={projectNames} onSelect={(eventId) => navigate(`/app/activity?event=${eventId}`)} />
          </Panel>
        </div>
      </div>
    </>
  )
}
