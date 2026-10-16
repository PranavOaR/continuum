import { describe, expect, it } from 'vitest'
import { formatDay, formatRelative } from '../utils/formatDate'
import { matchesQuery } from '../utils/search'

const NOW = Date.parse('2026-10-16T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('matchesQuery', () => {
  it('matches every term case-insensitively across fields', () => {
    expect(matchesQuery('google AUTH', 'Implement Google authentication')).toBe(true)
    expect(matchesQuery('google billing', 'Implement Google authentication')).toBe(false)
  })

  it('treats an empty query as a match', () => {
    expect(matchesQuery('   ', 'anything')).toBe(true)
  })

  it('ignores undefined fields', () => {
    expect(matchesQuery('src', undefined, 'src/auth/login.ts')).toBe(true)
  })
})

describe('formatRelative', () => {
  it.each([
    [10_000, 'just now'],
    [26 * 60_000, '26 min ago'],
    [60 * 60_000, '1 hour ago'],
    [5 * 3_600_000, '5 hours ago'],
    [30 * 3_600_000, 'yesterday'],
    [3 * 86_400_000, '3 days ago'],
  ])('formats %d ms ago as %s', (ms, expected) => {
    expect(formatRelative(ago(ms), NOW)).toBe(expected)
  })

  it('handles invalid dates', () => {
    expect(formatRelative('not a date', NOW)).toBe('Unknown time')
  })
})

describe('formatDay', () => {
  it('labels today and yesterday', () => {
    expect(formatDay(new Date(NOW).toISOString(), NOW)).toBe('Today')
    expect(formatDay(ago(86_400_000), NOW)).toBe('Yesterday')
  })
})
