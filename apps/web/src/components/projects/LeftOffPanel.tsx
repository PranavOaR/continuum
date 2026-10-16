import type { AgentSession } from '@continuum/core'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import { AgentChip } from '../shared/AgentChip'
import { Panel } from '../shared/Panel'
import { EvidenceBadge } from '../shared/StatusBadge'

/** For projects without a recorded task: the latest session's own account of where it stopped. */
export function LeftOffPanel({ sessions }: { sessions: AgentSession[] }) {
  const format = useTimeFormat()
  const [latest] = sessions
  return (
    <Panel title="Where we left off" description="No task is recorded yet, so this shows the latest agent session and all recorded work below.">
      {latest ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted">
            <AgentChip agent={latest.agent} />
            <span>last active {format(latest.endedAt)}</span>
            <EvidenceBadge type={latest.evidenceType} />
          </div>
          <p className="text-[14px] leading-relaxed text-fg">{latest.summary}</p>
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed text-muted">
          No agent sessions recorded yet. Run <span className="font-mono text-fg">continuum setup claude-code</span> in the repository to capture them.
        </p>
      )}
    </Panel>
  )
}
