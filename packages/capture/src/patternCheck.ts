import { Worker } from 'node:worker_threads'
import type { RedactionPreview } from '@continuum/core'
import { unusablePattern } from './patternShape'
import { BUILT_IN_REDACTOR, REDACTED } from './redact'

/** How long one pattern may take on a sample or a probe before it is refused. */
export const PATTERN_TIME_LIMIT_MS = 500
/**
 * How many times a probe repeats a character. At this length a pattern whose
 * work grows with the cube of the text (`[a-z]+[a-z0-9]+@`) takes seconds and
 * is refused, while an ordinary one such as `\\w+@` takes a few milliseconds.
 */
const PROBE_REPEATS = 4_000
const MAX_PROBED_LITERALS = 8

/**
 * Why a redaction pattern cannot be used, in words for the person who typed
 * it; null when nothing is wrong with it on its face. `slowOn` is the other
 * half: a pattern can pass this and still take too long on real text.
 */
export function patternProblem(pattern: string): string | null {
  if (pattern.trim() === '') return 'It is empty.'
  return unusablePattern(pattern)
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
  return ['a', '0', ' ', '_', 'aA0-_ ', ...literals].map((unit) => `${unit.repeat(PROBE_REPEATS)}\u0000`)
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
