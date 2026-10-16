import { FlaskConical, Info } from 'lucide-react'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import type { VerificationRecord } from '../../types'
import { Panel } from '../shared/Panel'
import { EmptyState } from '../shared/States'
import { EvidenceBadge, VerificationBadge } from '../shared/StatusBadge'

export function VerificationPanel({ records, currentRevision }: { records: VerificationRecord[]; currentRevision?: string }) {
  const format = useTimeFormat()

  return (
    <Panel id="verification" title="Verification" description="Recorded check results, tracked separately from task progress.">
      {records.length === 0 ? (
        <EmptyState icon={<FlaskConical />} title="No checks recorded" description="Verification status is unknown for this task." />
      ) : (
        <ul className="space-y-2.5">
          {records.map((record) => (
            <li key={record.id} className="rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-fg">{record.name}</p>
                <VerificationBadge status={record.status} />
              </div>
              <code className="mt-1 block font-mono text-[11.5px] break-all text-muted">{record.command}</code>
              <p className="mt-2 text-[12.5px] text-muted">{record.detail}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
                <EvidenceBadge type={record.evidenceType} />
                {record.lastRunAt ? <span>Last run {format(record.lastRunAt)}</span> : <span>No run recorded</span>}
                {record.lastRunRevision && (
                  <span className="font-mono">
                    at {record.lastRunRevision}
                    {currentRevision && record.lastRunRevision !== currentRevision && <span className="text-warning"> (current: {currentRevision})</span>}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 flex gap-1.5 text-[11px] text-subtle">
        <Info className="mt-px size-3 shrink-0" aria-hidden />
        Demonstrates the intended state model. No tests are run by this prototype.
      </p>
    </Panel>
  )
}
