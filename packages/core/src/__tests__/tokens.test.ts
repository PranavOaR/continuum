import { describe, expect, it } from 'vitest'
import { estimateTokens } from '../tokens'

describe('estimateTokens', () => {
  it('is zero for no text', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('rounds a partial token up, so it never reads as smaller than the text', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
  })
})
