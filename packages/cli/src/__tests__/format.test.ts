import { describe, expect, it } from 'vitest'
import { columns, formatAgo, formatDuration, plural } from '../format'

describe('format', () => {
  const now = new Date('2026-10-16T12:00:00Z')
  const ago = (ms: number) => formatAgo(new Date(now.getTime() - ms), now)

  it('describes elapsed time coarsely, never negative', () => {
    expect(ago(5_000)).toBe('just now')
    expect(ago(-5_000)).toBe('just now')
    expect(ago(3 * 60_000)).toBe('3m ago')
    expect(ago(5 * 3_600_000)).toBe('5h ago')
    expect(ago(2 * 86_400_000)).toBe('2d ago')
  })

  it('formats durations and plurals', () => {
    expect(formatDuration(420)).toBe('420ms')
    expect(formatDuration(1_250)).toBe('1.3s')
    expect(plural(1, 'file')).toBe('1 file')
    expect(plural(0, 'file')).toBe('0 files')
  })

  it('aligns columns without trailing spaces', () => {
    expect(columns([['a', 'long value', 'x'], ['longer', 'b', '']])).toEqual(['a       long value  x', 'longer  b'])
  })
})
