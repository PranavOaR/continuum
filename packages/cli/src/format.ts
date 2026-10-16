import type { CheckStatus } from '@continuum/core'
import type { FileChange } from '@continuum/capture'

export { formatAgo } from '@continuum/context'

const SECOND = 1000

const CHANGE_MARKS: Record<FileChange['changeType'], string> = { added: '+', modified: '~', deleted: '-' }

export const CHECK_LABELS: Record<CheckStatus, string> = {
  passed: 'passed',
  failed: 'failed',
  'out-of-date': 'out of date',
  unknown: 'unknown',
  'not-run': 'not run',
}

export function formatDuration(ms: number): string {
  return ms < SECOND ? `${ms}ms` : `${(ms / SECOND).toFixed(1)}s`
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export function formatChange(change: FileChange): string {
  return `${CHANGE_MARKS[change.changeType]} ${change.path}`
}

/** Left-aligned columns, so `status` output stays readable without a table library. */
export function columns(rows: readonly (readonly string[])[], gap = 2): string[] {
  const widths = rows.reduce<number[]>((acc, row) => row.map((cell, index) => Math.max(acc[index] ?? 0, cell.length)), [])
  return rows.map((row) =>
    row
      .map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] + gap)))
      .join('')
      .trimEnd(),
  )
}
