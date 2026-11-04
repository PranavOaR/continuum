import type { VerificationRecord } from '@continuum/core'

export interface CoverageNote {
  text: string
  /** Something the check covered changed after it ran, so its result may no longer hold. */
  hasChanges: boolean
}

const coveredFiles = (count: number) => `${count} covered file${count === 1 ? '' : 's'}`

/** How many of the files a check's latest run covered have changed since; null when no run recorded its coverage. */
export function coverageSummary(record: VerificationRecord): CoverageNote | null {
  if (record.coveredFiles === undefined) return null
  const changed = record.changedSince?.length ?? 0
  if (changed === 0) return { text: `${coveredFiles(record.coveredFiles)} unchanged since it ran`, hasChanges: false }
  return { text: `${changed} of ${coveredFiles(record.coveredFiles)} changed since it ran`, hasChanges: true }
}

/** Whether one covered file changed after the check ran against it. */
export function fileSinceCheck(record: VerificationRecord, path: string): CoverageNote {
  return record.changedSince?.includes(path)
    ? { text: 'Changed since this run', hasChanges: true }
    : { text: 'Unchanged since this run', hasChanges: false }
}
