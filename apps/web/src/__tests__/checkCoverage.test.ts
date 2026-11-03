import type { VerificationRecord } from '@continuum/core'
import { describe, expect, it } from 'vitest'
import { coverageSummary, fileSinceCheck } from '../components/projects/checkCoverage'

const record = (fields: Partial<VerificationRecord>): VerificationRecord => ({
  id: 'v',
  projectId: 'p',
  name: 'unit',
  command: 'npm test',
  status: 'passed',
  evidenceType: 'verified',
  detail: '',
  ...fields,
})

describe('coverageSummary', () => {
  it('says nothing when no run recorded its coverage', () => {
    expect(coverageSummary(record({}))).toBeNull()
  })

  it('reports every covered file unchanged since the run', () => {
    expect(coverageSummary(record({ coveredFiles: 5, changedSince: [] }))).toEqual({ text: '5 covered files unchanged since it ran', hasChanges: false })
    expect(coverageSummary(record({ coveredFiles: 1, changedSince: [] }))).toEqual({ text: '1 covered file unchanged since it ran', hasChanges: false })
  })

  it('counts the covered files that changed since the run', () => {
    expect(coverageSummary(record({ coveredFiles: 5, changedSince: ['src/a.ts', 'src/b.ts'] }))).toEqual({ text: '2 of 5 covered files changed since it ran', hasChanges: true })
  })
})

describe('fileSinceCheck', () => {
  it('tells whether this file changed after the check ran against it', () => {
    const check = record({ coveredFiles: 3, changedSince: ['src/a.ts'] })
    expect(fileSinceCheck(check, 'src/a.ts')).toEqual({ text: 'Changed since this run', hasChanges: true })
    expect(fileSinceCheck(check, 'src/b.ts')).toEqual({ text: 'Unchanged since this run', hasChanges: false })
  })
})
