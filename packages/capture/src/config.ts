import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CONTINUUM_DIR } from './git'
import { setCustomRedactions } from './redact'

export const CONFIG_FILE = 'config.json'

/** Per-repository settings, kept in .continuum/ with the store (local to this clone, never committed). */
export interface ContinuumConfig {
  /** Record tests, lint, typecheck and build commands an agent runs, with the exit code it observed. */
  agentChecks: boolean
  /** Record the prompts you type to agents, redacted. Off unless you turn it on. */
  capturePrompts: boolean
  /** Extra regular expressions to mask before anything is stored, e.g. internal ticket or customer ids. */
  redactPatterns: string[]
}

export const DEFAULT_CONFIG: Readonly<ContinuumConfig> = { agentChecks: true, capturePrompts: false, redactPatterns: [] }

const configPath = (root: string) => join(root, CONTINUUM_DIR, CONFIG_FILE)

/** Unknown or malformed values fall back to the defaults: a bad config must never break a hook. */
export async function readConfig(root: string): Promise<ContinuumConfig> {
  const path = configPath(root)
  if (!existsSync(path)) return { ...DEFAULT_CONFIG }
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    const values = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
    const flag = (key: 'agentChecks' | 'capturePrompts') => (typeof values[key] === 'boolean' ? (values[key] as boolean) : DEFAULT_CONFIG[key])
    const patterns = Array.isArray(values.redactPatterns) ? values.redactPatterns.filter((pattern): pattern is string => typeof pattern === 'string') : []
    return { agentChecks: flag('agentChecks'), capturePrompts: flag('capturePrompts'), redactPatterns: patterns }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/** Applies the repository's own redaction patterns to everything this process stores from now on. */
export async function applyRepositoryRedactions(root: string): Promise<void> {
  setCustomRedactions((await readConfig(root)).redactPatterns)
}

export async function updateConfig(root: string, change: Partial<ContinuumConfig>): Promise<ContinuumConfig> {
  const next = { ...(await readConfig(root)), ...change }
  const path = configPath(root)
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
  return next
}
