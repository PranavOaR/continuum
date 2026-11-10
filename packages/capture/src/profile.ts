import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MAX_PREFERENCE_CHARS, MAX_PREFERENCES, type Profile } from '@continuum/core'
import { BUILT_IN_REDACTOR } from './redact'

/** Your preferences for every repository, next to the registry in Continuum's per-user folder. Never inside a repository. */
export const PROFILE_FILE = 'profile.json'
const PROFILE_VERSION = 1
const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600

export const EMPTY_PROFILE: Profile = { preferences: [] }

/** The profile file cannot be used, or what was asked to be saved cannot be stored. */
export class InvalidProfileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidProfileError'
  }
}

const profilePath = (configDir: string) => join(configDir, PROFILE_FILE)
/** One line each: a preference is a sentence, and a line break could pass for a heading in a briefing. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Checks and tidies preferences: one line each, no blanks, no repeats, within the limits. */
function normalize(preferences: readonly unknown[]): string[] {
  if (preferences.some((preference) => typeof preference !== 'string')) throw new InvalidProfileError('Every preference must be text.')
  const tidy = [...new Set((preferences as string[]).map(oneLine).filter((preference) => preference !== ''))]
  if (tidy.length > MAX_PREFERENCES) throw new InvalidProfileError(`A profile holds at most ${MAX_PREFERENCES} preferences; remove one first.`)
  const long = tidy.find((preference) => preference.length > MAX_PREFERENCE_CHARS)
  if (long) throw new InvalidProfileError(`A preference can be at most ${MAX_PREFERENCE_CHARS} characters: "${long.slice(0, 40)}…" is ${long.length}.`)
  return tidy
}

/** Your profile; empty when you have not written one. Throws InvalidProfileError for a file that cannot be used. */
export async function readProfile(configDir: string): Promise<Profile> {
  const path = profilePath(configDir)
  if (!existsSync(path)) return EMPTY_PROFILE
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new InvalidProfileError(`Cannot read ${path} (${error instanceof Error ? error.message : String(error)}). Fix it, or delete it to start again.`)
  }
  const preferences = (parsed as { preferences?: unknown } | null)?.preferences
  if (!Array.isArray(preferences)) throw new InvalidProfileError(`${path} must hold a "preferences" list. Fix it, or delete it to start again.`)
  return { preferences: normalize(preferences) }
}

/**
 * Replaces your preferences. Secrets are masked with the built-in rules before
 * anything is written (a repository's own patterns apply when its briefing is
 * built), and the file is swapped in whole, readable only by you.
 */
export async function writeProfile(configDir: string, preferences: readonly string[]): Promise<Profile> {
  const profile: Profile = { preferences: normalize(normalize(preferences).map((preference) => BUILT_IN_REDACTOR.redact(preference))) }
  await mkdir(configDir, { recursive: true, mode: PRIVATE_DIR_MODE })
  const path = profilePath(configDir)
  // Unique per write: the dashboard's server can save twice at once.
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify({ version: PROFILE_VERSION, ...profile }, null, 2)}\n`, { mode: PRIVATE_FILE_MODE })
  await rename(temporary, path)
  return profile
}

/**
 * Your preferences as a briefing carries them, masked by the repository's own
 * rules. A profile that cannot be read gives none instead of failing: a
 * briefing must still reach the agent, and `continuum doctor` names the problem.
 */
export async function briefingPreferences(configDir: string | undefined, redact: (text: string) => string): Promise<string[]> {
  if (!configDir) return []
  try {
    return (await readProfile(configDir)).preferences.map(redact)
  } catch (error) {
    if (error instanceof InvalidProfileError) return []
    throw error
  }
}
