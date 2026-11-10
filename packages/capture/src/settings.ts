import { MAX_REDACT_PATTERNS } from '@continuum/core'
import { readConfig, updateConfig, type ContinuumConfig } from './config'
import { patternProblem, slowOn } from './patternCheck'


/** A settings change that cannot be saved; the message says which part and why. */
export class InvalidSettingsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSettingsError'
  }
}

const SWITCHES = ['agentChecks', 'capturePrompts', 'receipts'] as const

/** Only the settings there are, of the right kind; anything else is refused rather than written. */
function parseChange(change: Readonly<Record<string, unknown>>): Partial<ContinuumConfig> {
  const unknown = Object.keys(change).filter((key) => key !== 'redactPatterns' && !SWITCHES.includes(key as (typeof SWITCHES)[number]))
  if (unknown.length > 0) throw new InvalidSettingsError(`Unknown setting: ${unknown.join(', ')}.`)
  for (const key of SWITCHES) if (key in change && typeof change[key] !== 'boolean') throw new InvalidSettingsError(`${key} must be on or off.`)
  const patterns = change.redactPatterns
  if (patterns !== undefined && !(Array.isArray(patterns) && patterns.every((pattern) => typeof pattern === 'string'))) throw new InvalidSettingsError('Redaction patterns must be a list of text.')
  return change as Partial<ContinuumConfig>
}

/**
 * Saves a change to a repository's settings from the dashboard. A redaction
 * pattern being added is refused, with its reason, when it will not compile,
 * matches empty text or could hang. A config that already holds such a
 * pattern is refused too, as capture refuses it, until it is fixed by hand.
 */
export async function saveSettings(root: string, change: Readonly<Record<string, unknown>>): Promise<ContinuumConfig> {
  const parsed = parseChange(change)
  if (parsed.redactPatterns === undefined) return updateConfig(root, parsed)
  const patterns = [...new Set(parsed.redactPatterns)]
  if (patterns.length > MAX_REDACT_PATTERNS) throw new InvalidSettingsError(`A repository holds at most ${MAX_REDACT_PATTERNS} redaction patterns; remove one first.`)
  const saved = new Set((await readConfig(root)).redactPatterns)
  for (const pattern of patterns.filter((candidate) => !saved.has(candidate))) {
    const problem = patternProblem(pattern) ?? (await slowOn(pattern))
    if (problem) throw new InvalidSettingsError(`The pattern ${pattern} was not saved. ${problem}`)
  }
  return updateConfig(root, { ...parsed, redactPatterns: patterns })
}
