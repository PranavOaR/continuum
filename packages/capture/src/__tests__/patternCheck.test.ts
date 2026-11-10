import { describe, expect, it } from 'vitest'
import { maskWithin, patternProblem, previewRedaction, slowOn } from '../patternCheck'

describe('patternProblem', () => {
  it.each(['ACME-[0-9]{6}', 'TICKET-\\d+', '(?:foo|bar)-\\d{2,4}', 'cust_[a-z0-9]+', '(ab)+c', 'a{2}(b{3})', '[(+*]+x'])('accepts %s', (pattern) => {
    expect(patternProblem(pattern)).toBeNull()
  })

  it('refuses a pattern that does not compile, with the reason the engine gives', () => {
    expect(patternProblem('ACME-[0-9')).toMatch(/^It is not a valid regular expression: .*\[0-9.*/)
  })

  it('refuses an empty pattern, one that is too long and one that matches empty text', () => {
    expect(patternProblem('  ')).toBe('It is empty.')
    expect(patternProblem('a'.repeat(201))).toContain('the most is 200')
    expect(patternProblem('x*')).toContain('matches empty text')
  })

  it.each(['(a+)+$', '(\\w+\\s?)*!', '([a-z]+)*x', '((ab)+c)+d', '(a{1,}){2,}b', '(?:x+y?)+z'])('refuses %s, which repeats a group that itself repeats', (pattern) => {
    expect(patternProblem(pattern)).toContain('repeats a group that itself repeats')
  })

  it.each(['\\w+\\w+\\w+\\w+@', 'a*a*a*a*b', '\\d+\\d+X', '\\w+\\s?\\w+@', '.+.+x', '[^@]+\\w+@'])('refuses %s, which has two repeats in a row over the same characters', (pattern) => {
    expect(patternProblem(pattern)).toContain('two repeats in a row')
  })

  it.each(['[A-Z]+-[0-9]+', '[A-Z]+[0-9]{4}', 'cust_[a-z0-9]+_\\d+', '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[a-z]{2,}'])('still accepts %s', (pattern) => {
    expect(patternProblem(pattern)).toBeNull()
  })
})

describe('createRedactor', () => {
  it('never compiles a pattern that could hang, even from a config edited by hand', async () => {
    const { createRedactor } = await import('../redact')
    const redactor = createRedactor(['\\w+\\w+\\w+\\w+@', 'ACME-[0-9]{6}'])
    expect(redactor.rejectedPatterns).toEqual(['\\w+\\w+\\w+\\w+@'])
    const started = Date.now()
    expect(redactor.redact(`${'a'.repeat(600)} ACME-123456`)).toContain('[redacted]')
    expect(Date.now() - started).toBeLessThan(1_000)
  })
})

describe('maskWithin', () => {
  it('masks what the pattern matches and counts it', async () => {
    expect(await maskWithin('ACME-[0-9]{6}', 'call ACME-123456 and ACME-654321')).toEqual({ text: 'call [redacted] and [redacted]', count: 2 })
  })

  it('stops a pattern that would run for minutes, and says so', async () => {
    const started = Date.now()
    expect(await maskWithin('(a|aa)+$', `${'a'.repeat(45)}!`, 200)).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(5_000)
  })
})

describe('slowOn', () => {
  it('catches a pattern whose repeats overlap without nesting', async () => {
    expect(await slowOn('(a|aa)+$', 200)).toContain('took more than 200 ms')
  })

  it('catches repeats over overlapping classes that the shape checks let through', async () => {
    expect(patternProblem('[a-z]+[a-z0-9]+@')).toBeNull()
    expect(await slowOn('[a-z]+[a-z0-9]+@', 300)).toContain('took more than 300 ms')
  })

  it('passes an ordinary pattern', async () => {
    expect(await slowOn('ACME-[0-9]{6}')).toBeNull()
  })
})

describe('previewRedaction', () => {
  it('shows the sample as it would be stored: built-in rules, then each usable pattern', async () => {
    const preview = await previewRedaction(['ACME-[0-9]{6}'], 'ACME-123456 uses AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
    expect(preview.masked).toContain('[redacted] uses')
    expect(preview.masked).not.toContain('wJalrXUtnFEMI')
    expect(preview.count).toBe(2)
    expect(preview.refused).toEqual([])
  })

  it('refuses a bad pattern with its reason, and still applies the good one', async () => {
    const preview = await previewRedaction(['(a+)+$', 'ACME-[0-9]{6}', 'ACME-[0-9'], 'ACME-123456')
    expect(preview.masked).toBe('[redacted]')
    expect(preview.refused.map(({ pattern }) => pattern)).toEqual(['(a+)+$', 'ACME-[0-9'])
    expect(preview.refused[0].reason).toContain('repeats a group that itself repeats')
  })
})
