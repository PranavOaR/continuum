import { FlaskConical, Info } from 'lucide-react'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import type { VerificationRecord } from '@continuum/core'
import { useIsLive } from '../../state/dataMode'
import { Panel } from '../shared/Panel'
import { EmptyState } from '../shared/States'
import { CommandChangedBadge, EvidenceBadge, VerificationBadge } from '../shared/StatusBadge'
import { coverageSummary } from './checkCoverage'

/** Spells out the earlier command, so it is not only in the badge's tooltip. */
export function PreviousCommandNote({ command }: { command: string }) {
  return (
    <p className="mt-1 text-[11.5px] break-all text-warning">
      Previously ran <code className="font-mono">{command}</code>; earlier results came from that command.
    </p>
  )
}

function CheckRow({ record, currentRevision }: { record: VerificationRecord; currentRevision?: string }) {
  const format = useTimeFormat()
  const coverage = coverageSummary(record)

  return (
    <li className="rounded-md border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-fg">{record.name}</p>
        <div className="flex flex-wrap gap-1.5">
          {record.previousCommand && <CommandChangedBadge previousCommand={record.previousCommand} />}
          <VerificationBadge status={record.status} />
        </div>
      </div>
      <code className="mt-1 block font-mono text-[11.5px] break-all text-muted">{record.command}</code>
      {record.previousCommand && <PreviousCommandNote command={record.previousCommand} />}
      <p className="mt-2 text-[12.5px] text-muted">{record.detail}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
        <EvidenceBadge type={record.evidenceType} />
        {record.lastRunAt ? <span>Last run {format(record.lastRunAt)}</span> : <span>No run recorded</span>}
        {coverage && <span className={coverage.hasChanges ? 'text-warning' : undefined}>{coverage.text}</span>}
        {record.lastRunRevision && (
          <span className="font-mono">
            at {record.lastRunRevision}
            {currentRevision && record.lastRunRevision !== currentRevision && <span className="text-warning"> (current: {currentRevision})</span>}
          </span>
        )}
      </div>
    </li>
  )
}

export function VerificationPanel({ records, currentRevision }: { records: VerificationRecord[]; currentRevision?: string }) {
  const isLive = useIsLive()

  return (
    <Panel id="verification" title="Verification" description="Recorded check results, tracked separately from task progress.">
      {records.length === 0 ? (
        <EmptyState
          icon={<FlaskConical />}
          title="No checks recorded"
          description={isLive ? 'Record one with continuum run -- <your test command>.' : 'Verification status is unknown for this task.'}
        />
      ) : (
        <ul className="space-y-2.5">
          {records.map((record) => (
            <CheckRow key={record.id} record={record} currentRevision={currentRevision} />
          ))}
        </ul>
      )}
      <p className="mt-3 flex gap-1.5 text-[11px] text-subtle">
        <Info className="mt-px size-3 shrink-0" aria-hidden />
        {isLive
          ? 'Verified results come from continuum run, observed ones from a test an agent ran itself. Both are judged against the current file contents: a result goes out of date as soon as a file it covered changes.'
          : 'Demonstrates the intended state model. No tests are run by this prototype.'}
      </p>
    </Panel>
  )
}
