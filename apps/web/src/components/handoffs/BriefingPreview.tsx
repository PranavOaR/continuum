import { Copy } from 'lucide-react'
import { useServiceQuery } from '../../hooks/useServiceQuery'
import { continuumService } from '../../services'
import { useToast } from '../../state/toasts'
import { copyToClipboard } from '../../utils/clipboard'
import { Button } from '../shared/Button'
import { ErrorState, LoadingBlock } from '../shared/States'

/** The exact briefing a new agent session receives, for projects with no recorded task to hand off. */
export function BriefingPreview({ projectId }: { projectId: string }) {
  const notify = useToast()
  const briefing = useServiceQuery(`briefing:${projectId}`, () => continuumService.getBriefing(projectId))
  if (briefing.isLoading) return <LoadingBlock rows={3} label="Loading briefing" />
  if (briefing.error || briefing.data === undefined) {
    return <ErrorState title="Could not load the briefing" description={briefing.error?.message ?? 'No briefing available.'} />
  }
  const text = briefing.data
  const copy = async () => {
    const result = await copyToClipboard(text)
    notify(result.ok ? 'Briefing copied' : `Could not copy: ${result.reason}`, result.ok ? 'success' : 'error')
  }
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] leading-relaxed text-muted">
        No task is recorded for this project, so here is the briefing a new agent session receives: where the last session left off, checks
        judged against the current code, and recorded decisions.
      </p>
      <pre className="max-h-[420px] overflow-auto rounded-md border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-fg">
        {text}
      </pre>
      <Button size="sm" icon={<Copy />} onClick={() => void copy()}>
        Copy briefing
      </Button>
    </div>
  )
}
