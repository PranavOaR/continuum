import { Worker } from 'node:worker_threads'
import type { RedactionPreview } from '@continuum/core'
import { BUILT_IN_REDACTOR, MAX_CUSTOM_PATTERN_CHARS, REDACTED } from './redact'

/** How long one pattern may take on a sample or a probe before it is refused. */
export const PATTERN_TIME_LIMIT_MS = 500
/** How many times a probe repeats a character: enough for a pattern that backtracks badly to run for minutes. */
const PROBE_REPEATS = 40
const MAX_PROBED_LITERALS = 8

/** What the scan below needs to remember about a group that is still open. */
interface OpenGroup {
  /** Something inside it can repeat without limit (`+`, `*`, `{2,}`). */
  repeats: boolean
}

/** The quantifier starting at `index`, if any: its length, and whether it lets its item repeat more than once. */
function quantifierAt(pattern: string, index: number): { length: number; repeats: boolean } | null {
  const char = pattern[index]
  if (char === '*' || char === '+') return { length: 1, repeats: true }
  if (char === '?') return { length: 1, repeats: false }
  const braces = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(index))
  if (!braces) return null
  const max = braces[2] === undefined ? Number(braces[1]) : braces[3] === '' ? Number.POSITIVE_INFINITY : Number(braces[3])
  return { length: braces[0].length, repeats: max > 1 }
}

/**
 * Whether a group that can repeat itself contains something that repeats, as
 * in `(a+)+` or `(\w+\s?)*`. On text that almost matches, such a pattern tries
 * every way to split it, and the time doubles with each character.
 */
function repeatsARepeat(pattern: string): boolean {
  const open: OpenGroup[] = []
  let index = 0
  while (index < pattern.length) {
    const char = pattern[index]
    if (char === '\\') index += 2
    else if (char === '[') {
      // A character class is one item, whatever it holds.
      index += 1
      while (index < pattern.length && pattern[index] !== ']') index += pattern[index] === '\\' ? 2 : 1
      index += 1
    } else if (char === '(') {
      open.push({ repeats: false })
      index += 1
    } else if (char === ')') {
      const group = open.pop()
      const quantifier = quantifierAt(pattern, index + 1)
      if (group?.repeats && quantifier?.repeats) return true
      // A group that repeats, or holds a repeat, makes the group around it one that does.
      const outer = open.at(-1)
      if (outer && (group?.repeats || quantifier?.repeats)) outer.repeats = true
      index += 1 + (quantifier?.length ?? 0)
    } else {
      const quantifier = quantifierAt(pattern, index)
      const group = open.at(-1)
      if (quantifier?.repeats && group) group.repeats = true
      index += quantifier?.length ?? 1
    }
  }
  return false
}

/**
 * Why a redaction pattern cannot be used, in words for the person who typed
 * it; null when nothing is wrong with it on its face. `slowOn` is the other
 * half: a pattern can pass this and still take too long on real text.
 */
export function patternProblem(pattern: string): string | null {
  if (pattern.trim() === '') return 'It is empty.'
  if (pattern.length > MAX_CUSTOM_PATTERN_CHARS) return `It is ${pattern.length} characters long; the most is ${MAX_CUSTOM_PATTERN_CHARS}.`
  let compiled: RegExp
  try {
    compiled = new RegExp(pattern, 'g')
  } catch (error) {
    return `It is not a valid regular expression: ${error instanceof Error ? error.message.replace(/^Invalid regular expression: /, '') : String(error)}.`
  }
  if (compiled.test('')) return 'It matches empty text, so it would put [redacted] between every character.'
  if (repeatsARepeat(pattern)) return 'It repeats a group that itself repeats, like (a+)+. On text that almost matches, that can run for minutes and stop Continuum recording. Remove one of the two repeats.'
  return null
}

const WORKER = `
const { parentPort, workerData } = require('node:worker_threads')
let count = 0
const text = workerData.text.replace(new RegExp(workerData.pattern, 'g'), () => {
  count += 1
  return workerData.replacement
})
parentPort.postMessage({ text, count })
`

export type Masked = { text: string; count: number }

/**
 * Masks what one pattern matches in `text`, on another thread that is stopped
 * if it runs past the limit: a regular expression cannot be interrupted where
 * it runs, and one that hangs must not take the dashboard's server with it.
 */
export function maskWithin(pattern: string, text: string, timeoutMs: number = PATTERN_TIME_LIMIT_MS): Promise<Masked | 'timeout'> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER, { eval: true, workerData: { pattern, text, replacement: REDACTED } })
    const timer = setTimeout(() => {
      void worker.terminate()
      resolve('timeout')
    }, timeoutMs)
    worker.once('message', (masked: Masked) => {
      clearTimeout(timer)
      void worker.terminate()
      resolve(masked)
    })
    worker.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

/** Text built to make a badly backtracking pattern show itself: long runs of the characters it names, ending in one it cannot match. */
function probes(pattern: string): string[] {
  const literals = [...new Set(pattern.match(/[A-Za-z0-9]/g) ?? [])].slice(0, MAX_PROBED_LITERALS)
  return ['a', '0', 'aA0-_ ', ...literals].map((unit) => `${unit.repeat(PROBE_REPEATS)}\u0000`)
}

/** Why a pattern that looks fine still cannot be used: it ran past the limit on a probe. Null when it kept within it. */
export async function slowOn(pattern: string, timeoutMs: number = PATTERN_TIME_LIMIT_MS): Promise<string | null> {
  for (const probe of probes(pattern)) {
    if ((await maskWithin(pattern, probe, timeoutMs)) === 'timeout') {
      return `It took more than ${timeoutMs} ms on ${probe.length} characters of test text, so it could stop Continuum recording on real text. Make its repeats more specific.`
    }
  }
  return null
}

/**
 * What a repository's redaction would make of `sample` with these patterns:
 * the built-in rules first, then each pattern, as capture applies them.
 * A pattern that cannot be used, or runs past the limit on the sample, is
 * refused with its reason and the rest still apply.
 */
export async function previewRedaction(patterns: readonly string[], sample: string, timeoutMs: number = PATTERN_TIME_LIMIT_MS): Promise<RedactionPreview> {
  const builtIn = BUILT_IN_REDACTOR.redactWithCount(sample)
  const preview: RedactionPreview = { masked: builtIn.text, count: builtIn.count, refused: [] }
  for (const pattern of new Set(patterns)) {
    const problem = patternProblem(pattern)
    const masked = problem ? null : await maskWithin(pattern, preview.masked, timeoutMs)
    if (masked === null || masked === 'timeout') {
      preview.refused.push({ pattern, reason: problem ?? `It took more than ${timeoutMs} ms on this sample, so it could stop Continuum recording. Make its repeats more specific.` })
      continue
    }
    preview.masked = masked.text
    preview.count += masked.count
  }
  return preview
}
