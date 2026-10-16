import { ArrowLeft, ArrowRight, CircleCheck, Copy, Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { HandoffContextPreview, TokenEstimate } from '../components/handoffs/HandoffContextPreview'
import { AgentChip } from '../components/shared/AgentChip'
import { Button, ButtonLink } from '../components/shared/Button'
import { Dialog } from '../components/shared/Dialog'
import { PageHeader } from '../components/shared/PageHeader'
import { ErrorState, LoadingBlock } from '../components/shared/States'
import { HandoffStatusBadge, TaskStatusBadge } from '../components/shared/StatusBadge'
import { getAgent } from '@continuum/core'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useTimeFormat } from '../hooks/useTimeFormat'
import { useWorkspace } from '../hooks/useWorkspace'
import { useHandoffs } from '../state/handoffs'
import { useToast } from '../state/toasts'
import type { Handoff } from '@continuum/core'
import { buildHandoffContext } from '@continuum/core'
import { copyToClipboard } from '../utils/clipboard'

const PREPARED_MESSAGE = 'Handoff prepared. Your context is ready to use with the selected agent.'

function ClipboardFallback({ text, reason, onClose }: { text: string | null; reason: string; onClose: () => void }) {
  return (
    <Dialog open={text !== null} onClose={onClose} title="Copy manually" description={`Clipboard access failed: ${reason}`} size="lg">
      <label htmlFor="handoff-fallback" className="mb-2 block text-[12px] text-muted">
        Select the text below and copy it with your keyboard.
      </label>
      <textarea
        id="handoff-fallback"
        readOnly
        value={text ?? ''}
        onFocus={(event) => event.currentTarget.select()}
        rows={16}
        className="w-full rounded-md border border-line-strong bg-bg p-3 font-mono text-[12px] text-fg"
      />
    </Dialog>
  )
}

function HandoffPreview({ handoff }: { handoff: Handoff }) {
  const { data: workspace, error, isLoading } = useWorkspace(handoff.projectId)
  const { setHandoffStatus } = useHandoffs()
  const notify = useToast()
  const format = useTimeFormat()
  const [fallback, setFallback] = useState<{ text: string; reason: string } | null>(null)

  const context = useMemo(() => {
    if (!workspace) return undefined
    try {
      return buildHandoffContext({ workspace, ...handoff })
    } catch (buildError) {
      return buildError instanceof Error ? buildError : new Error('Could not build handoff context.')
    }
  }, [workspace, handoff])

  if (isLoading) return <LoadingBlock rows={4} label="Loading handoff" />
  if (error || !workspace) return <ErrorState title="Could not load the project for this handoff" description={error?.message} />
  if (!context || context instanceof Error) {
    return <ErrorState title="Handoff preparation error" description={context?.message ?? 'The handoff context could not be generated.'} />
  }

  const copy = async () => {
    const result = await copyToClipboard(context.text)
    if (result.ok) {
      setHandoffStatus(handoff.id, 'copied')
      notify(`Context copied. Paste it into ${getAgent(handoff.targetAgent).name} to continue.`)
    } else {
      setFallback({ text: context.text, reason: result.reason })
    }
  }

  const markPrepared = () => {
    setHandoffStatus(handoff.id, 'prepared')
    notify(PREPARED_MESSAGE)
  }

  const projectLink = `/app/projects/${workspace.project.id}?task=${context.task.id}`

  return (
    <>
      <PageHeader
        title="Handoff preview"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <AgentChip agent={handoff.sourceAgent} />
            <ArrowRight className="size-3.5 text-subtle" aria-label="to" />
            <AgentChip agent={handoff.targetAgent} />
          </span>
        }
        crumbs={[{ label: 'Handoffs', to: '/app/handoffs' }, { label: `${workspace.project.name} · ${context.task.title}` }]}
        actions={
          <>
            <ButtonLink to={projectLink} size="sm" icon={<ArrowLeft />}>
              Back to Project
            </ButtonLink>
            <Button size="sm" icon={<CircleCheck />} onClick={markPrepared} disabled={handoff.status !== 'draft'}>
              {handoff.status === 'draft' ? 'Mark as Prepared' : 'Prepared'}
            </Button>
            <Button variant="primary" size="sm" icon={<Copy />} onClick={() => void copy()}>
              Copy Context
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <dl className="space-y-3 rounded-lg border border-line bg-surface p-4 text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Status</dt>
              <dd>
                <HandoffStatusBadge status={handoff.status} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Project</dt>
              <dd className="text-right text-fg">{workspace.project.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Task status</dt>
              <dd>
                <TaskStatusBadge status={context.task.status} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Created</dt>
              <dd className="text-fg">{format(handoff.createdAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Context size</dt>
              <dd>
                <TokenEstimate tokens={context.estimatedTokens} />
              </dd>
            </div>
          </dl>
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="label-mono text-muted ">Task objective</p>
            <p className="mt-1 text-[13px] text-fg">{context.task.objective}</p>
          </div>
          <p className="flex gap-2 text-[12px] text-subtle">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Nothing has been sent to {getAgent(handoff.targetAgent).name}. Copy the context and paste it into the agent yourself.
          </p>
        </aside>

        <div className="min-w-0 space-y-4">
          <HandoffContextPreview context={context} />
          <details className="rounded-lg border border-line bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-fg">Plain-text context (what gets copied)</summary>
            <pre className="overflow-x-auto border-t border-line px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-muted">{context.text}</pre>
          </details>
        </div>
      </div>

      <ClipboardFallback text={fallback?.text ?? null} reason={fallback?.reason ?? ''} onClose={() => setFallback(null)} />
    </>
  )
}

export function HandoffPreviewPage() {
  const { handoffId = '' } = useParams()
  const { handoffs } = useHandoffs()
  const handoff = handoffs.find((candidate) => candidate.id === handoffId)
  useDocumentTitle('Handoff preview')

  if (!handoff) {
    return (
      <ErrorState
        title="Handoff not found"
        description="It may have been removed when the demo data was reset."
        action={<ButtonLink to="/app/handoffs">Back to handoffs</ButtonLink>}
      />
    )
  }
  return <HandoffPreview handoff={handoff} />
}
