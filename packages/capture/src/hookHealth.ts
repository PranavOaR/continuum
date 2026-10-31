import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CONTINUUM_DIR } from './git'

/**
 * Whether an agent's hooks reach Continuum. Hooks must never disturb the
 * agent, so a failing one exits quietly; this is where doctor and status
 * find out. Each fact is its own file, written whole, so hooks running at
 * the same time cannot erase each other's record.
 */
const HOOKS_DIR = 'hooks'

export interface HookHealth {
  lastArrivalAt: string | null
  lastFailure: { at: string; message: string } | null
  /** The most recent hook failed: no hook has arrived since. */
  isFailing: boolean
}

const fileOf = (root: string, agent: string, fact: 'arrival' | 'failure') => join(root, CONTINUUM_DIR, HOOKS_DIR, `${agent}.${fact}.json`)

async function writeFact(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 })
  await rename(temporary, path)
}

async function readFact(path: string): Promise<Record<string, unknown> | null> {
  if (!existsSync(path)) return null
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    // Written whole by rename, so a partial file means someone edited it; it carries no reliable fact.
    return null
  }
}

/** A hook from `agent` reached Continuum in this repository. */
export function recordHookArrival(root: string, agent: string, at: Date): Promise<void> {
  return writeFact(fileOf(root, agent, 'arrival'), { at: at.toISOString() })
}

/** A hook from `agent` failed here; the message says why. */
export function recordHookFailure(root: string, agent: string, at: Date, message: string): Promise<void> {
  return writeFact(fileOf(root, agent, 'failure'), { at: at.toISOString(), message })
}

export async function readHookHealth(root: string, agent: string): Promise<HookHealth> {
  const [arrival, failure] = await Promise.all([readFact(fileOf(root, agent, 'arrival')), readFact(fileOf(root, agent, 'failure'))])
  const lastArrivalAt = typeof arrival?.at === 'string' ? arrival.at : null
  const lastFailure = typeof failure?.at === 'string' && typeof failure.message === 'string' ? { at: failure.at, message: failure.message } : null
  // An arrival is recorded before the work that may fail, so a failure at or after it is the latest outcome.
  const isFailing = lastFailure !== null && (lastArrivalAt === null || lastFailure.at >= lastArrivalAt)
  return { lastArrivalAt, lastFailure, isFailing }
}
