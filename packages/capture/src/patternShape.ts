import { MAX_CUSTOM_PATTERN_CHARS } from './limits'

/**
 * Checks on a redaction pattern's shape that need no running: capture applies
 * these patterns on the main thread of every hook, so one that can backtrack
 * for minutes must never be compiled there, even from a hand-edited config.
 * They are deliberately strict; a pattern that runs too long in a way they
 * cannot see is caught when it is saved from the dashboard, by timing it.
 */

/** A token of the pattern: one character, escape, class or group, and the quantifier after it. */
interface Item {
  /** The item's source without its quantifier, to tell `\\w+\\w+` from `\\w+\\d+`. */
  text: string
  /** It can match many characters of the same kind: `\\w`, `.`, `\\S`, a negated class. */
  isBroad: boolean
  /** Its quantifier lets it repeat without limit: `+`, `*`, `{2,}`. */
  isUnbounded: boolean
  /** Its quantifier lets it match nothing, so it does not separate its neighbours: `?`, `*`, `{0,n}`. */
  isOptional: boolean
}

const BROAD_ESCAPES = new Set(['w', 'W', 'd', 'D', 's', 'S'])

/** The quantifier starting at `index`, if any: its length, its upper bound and whether it allows zero. */
function quantifierAt(pattern: string, index: number): { length: number; max: number; allowsZero: boolean } | null {
  const char = pattern[index]
  const lazy = (length: number) => (pattern[index + length] === '?' ? length + 1 : length)
  if (char === '*') return { length: lazy(1), max: Number.POSITIVE_INFINITY, allowsZero: true }
  if (char === '+') return { length: lazy(1), max: Number.POSITIVE_INFINITY, allowsZero: false }
  if (char === '?') return { length: lazy(1), max: 1, allowsZero: true }
  const braces = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(index))
  if (!braces) return null
  const min = Number(braces[1])
  const max = braces[2] === undefined ? min : braces[3] === '' ? Number.POSITIVE_INFINITY : Number(braces[3])
  return { length: lazy(braces[0].length), max, allowsZero: min === 0 }
}

interface Sequence {
  /** The last item that must match something, to compare with the next repeat. */
  previous: Item | null
  /** Something inside it repeats without limit. */
  hasRepeat: boolean
}

/** Two repeats in a row that can match the same text split every way: `\\w+\\w+`, `a*a*`. */
const overlaps = (previous: Item | null, item: Item) => previous !== null && previous.isUnbounded && item.isUnbounded && (previous.isBroad || item.isBroad || previous.text === item.text)

const NESTED = 'It repeats a group that itself repeats, like (a+)+. On text that almost matches, that can run for minutes and stop Continuum recording. Remove one of the two repeats.'
const ADJACENT = 'It has two repeats in a row that can match the same characters, like \\w+\\w+. On text that almost matches, that can run for minutes and stop Continuum recording. Put a fixed character between them, or give one a limit such as {1,20}.'

/** The reason a pattern's shape could make it backtrack badly; null when none is found. */
function backtrackingProblem(pattern: string): string | null {
  const stack: Sequence[] = [{ previous: null, hasRepeat: false }]
  let index = 0
  const finish = (text: string, isBroad: boolean, end: number, containsRepeat: boolean): string | null => {
    const quantifier = quantifierAt(pattern, end)
    const item: Item = { text, isBroad, isUnbounded: (quantifier?.max ?? 1) > 1 && quantifier?.max === Number.POSITIVE_INFINITY, isOptional: quantifier?.allowsZero ?? false }
    const sequence = stack[stack.length - 1]
    if (containsRepeat && item.isUnbounded) return NESTED
    if (overlaps(sequence.previous, item)) return ADJACENT
    if (item.isUnbounded || containsRepeat) sequence.hasRepeat = true
    if (!item.isOptional) sequence.previous = item
    else if (item.isUnbounded && sequence.previous === null) sequence.previous = item
    index = end + (quantifier?.length ?? 0)
    return null
  }
  const groups: number[] = []
  while (index < pattern.length) {
    const char = pattern[index]
    let problem: string | null = null
    if (char === '\\') problem = finish(pattern.slice(index, index + 2), BROAD_ESCAPES.has(pattern[index + 1] ?? ''), index + 2, false)
    else if (char === '[') {
      let end = index + 1
      while (end < pattern.length && pattern[end] !== ']') end += pattern[end] === '\\' ? 2 : 1
      problem = finish(pattern.slice(index, end + 1), pattern[index + 1] === '^', end + 1, false)
    } else if (char === '.') problem = finish('.', true, index + 1, false)
    else if (char === '(') {
      groups.push(index)
      stack.push({ previous: null, hasRepeat: false })
      index += 1
    } else if (char === '|') {
      // Each branch is its own sequence; whether any branch repeats carries over.
      const sequence = stack[stack.length - 1]
      sequence.previous = null
      index += 1
    } else if (char === ')' && stack.length > 1) {
      const inner = stack.pop() as Sequence
      const opened = groups.pop() ?? index
      problem = finish(pattern.slice(opened, index + 1), false, index + 1, inner.hasRepeat)
    } else if (char === '^' || char === '$') index += 1
    else problem = finish(char, false, index + 1, false)
    if (problem) return problem
  }
  return null
}

/**
 * Why a custom redaction pattern cannot be used; null when it can. It must be
 * short, compile, match something, and have no shape that backtracks badly.
 */
export function unusablePattern(pattern: string): string | null {
  if (pattern.length > MAX_CUSTOM_PATTERN_CHARS) return `It is ${pattern.length} characters long; the most is ${MAX_CUSTOM_PATTERN_CHARS}.`
  let compiled: RegExp
  try {
    compiled = new RegExp(pattern, 'g')
  } catch (error) {
    return `It is not a valid regular expression: ${error instanceof Error ? error.message.replace(/^Invalid regular expression: /, '') : String(error)}.`
  }
  if (compiled.test('')) return 'It matches empty text, so it would put [redacted] between every character.'
  return backtrackingProblem(pattern)
}
