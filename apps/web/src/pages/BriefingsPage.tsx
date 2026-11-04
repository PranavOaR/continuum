import { Copy, FolderGit2, Info } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { estimateTokens } from '@continuum/core'
import { ClipboardFallback } from '../components/briefings/ClipboardFallback'
import { Badge } from '../components/shared/Badge'
import { Button } from '../components/shared/Button'
import { SelectField } from '../components/shared/Fields'
import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState, ErrorState, LoadingBlock } from '../components/shared/States'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useServiceQuery } from '../hooks/useServiceQuery'
import { usePreferredProjectId, useProjects } from '../hooks/useWorkspace'
import { continuumService } from '../services'
import { useIsLive } from '../state/dataMode'
import { useToast } from '../state/toasts'
import { copyToClipboard } from '../utils/clipboard'

const LIVE_NOTE = 'This is what continuum handoff prints and what agents read with get_handoff. When a session starts, agents with hooks get a shorter version, with what changed since their last session at the top.'
const DEMO_NOTE = 'A short sample. A real briefing is built from the records of your repository.'

function Briefing({ projectId }: { projectId: string }) {
  const notify = useToast()
  const [fallback, setFallback] = useState<{ text: string; reason: string } | null>(null)
  const { data: text, error, isLoading } = useServiceQuery(`briefing:${projectId}`, () => continuumService.getBriefing(projectId))

  if (isLoading) return <LoadingBlock rows={4} label="Loading briefing" />
  if (error || text === undefined) return <ErrorState title="Could not load the briefing" description={error?.message ?? 'No briefing available.'} />

  const copy = async () => {
    const result = await copyToClipboard(text)
    if (result.ok) notify('Briefing copied. Paste it into any agent or chat.')
    else setFallback({ text, reason: result.reason })
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Badge tone="muted" title="Rough estimate: characters ÷ 4. Not measured with a model tokenizer.">
          ≈ {estimateTokens(text).toLocaleString()} tokens (estimate)
        </Badge>
        <Button variant="primary" size="sm" icon={<Copy />} onClick={() => void copy()}>
          Copy briefing
        </Button>
      </div>
      <pre aria-label="Briefing text" className="overflow-x-auto rounded-lg border border-line bg-surface p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg">
        {text}
      </pre>
      <ClipboardFallback text={fallback?.text ?? null} reason={fallback?.reason ?? ''} onClose={() => setFallback(null)} />
    </>
  )
}

export function BriefingsPage() {
  useDocumentTitle('Briefings')
  const isLive = useIsLive()
  const projects = useProjects()
  const preferredProjectId = usePreferredProjectId()
  const [searchParams, setSearchParams] = useSearchParams()
  const projectId = searchParams.get('project') ?? preferredProjectId
  const list = projects.data
  // An old link may name a project this dashboard no longer serves: say so, rather than show another's briefing.
  const isKnown = list === undefined || list.some(({ project }) => project.id === projectId)

  return (
    <>
      <PageHeader title="Briefings" description="What a new agent session is told about each project." crumbs={[{ label: 'Overview', to: '/app' }, { label: 'Briefings' }]} />

      <p className="mb-5 flex gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-[12px] text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {isLive ? LIVE_NOTE : DEMO_NOTE}
      </p>

      {projects.error && <ErrorState title="Could not load your projects" description={projects.error.message} />}
      {list?.length === 0 && <EmptyState icon={<FolderGit2 />} title="No projects yet" description="Run continuum setup in a repository, and its briefing appears here." />}
      {!projects.error && list?.length !== 0 && (
        <div className="mb-4 max-w-xs">
          <SelectField label="Project" value={isKnown ? (projectId ?? '') : ''} onChange={(event) => setSearchParams({ project: event.target.value }, { replace: true })}>
            {!isKnown && (
              <option value="" disabled hidden>
                Choose a project
              </option>
            )}
            {(list ?? []).map(({ project }) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      {!isKnown && list?.length !== 0 && <EmptyState title="Project not found" description="This dashboard does not serve that project. Choose another above." />}
      {isKnown && projectId && <Briefing key={projectId} projectId={projectId} />}
    </>
  )
}
