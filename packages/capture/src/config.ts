import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CONTINUUM_DIR } from './git'
import { unusablePattern } from './patternShape'
import { createRedactor, type Redactor } from './redact'

export const CONFIG_FILE = 'config.json'

/** Per-repository settings, kept in .continuum/ with the store (local to this clone, never committed). */
export interface ContinuumConfig {
  /** Record tests, lint, typecheck and build commands an agent runs, with the exit code it observed. */
  agentChecks: boolean
  /** Record the prompts you type to agents, redacted. Off unless you turn it on. */
  capturePrompts: boolean
  /** Extra regular expressions to mask before anything is stored, e.g. internal ticket or customer ids. */
  redactPatterns: string[]
  /** After a Claude Code reply that recorded something, show one line saying what. */
  receipts: boolean
  /** On each prompt, add the recorded decisions and issues its words point to (Claude Code and Codex). */
  recall: boolean
}

export const DEFAULT_CONFIG: Readonly<ContinuumConfig> = { agentChecks: true, capturePrompts: false, redactPatterns: [], receipts: true, recall: true }

const configPath = (root: string) => join(root, CONTINUUM_DIR, CONFIG_FILE)

/**
 * The config exists but cannot be read. Nothing is captured until it is fixed:
 * guessing would store what its redactPatterns were meant to mask.
 */
export class InvalidConfigError extends Error {
  constructor(path: string, reason: string) {
    super(`${path} is not valid: ${reason}. Fix it, or delete it to use the defaults; until then Continuum records nothing in this repository.`)
    this.name = 'InvalidConfigError'
  }
}

type RawConfig = Record<string, unknown>

/** The file as written, validated; unknown keys are kept so a rewrite never loses them. */
async function readRawConfig(root: string): Promise<RawConfig> {
  const path = configPath(root)
  if (!existsSync(path)) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new InvalidConfigError(path, error instanceof SyntaxError ? `not valid JSON (${error.message})` : String(error))
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new InvalidConfigError(path, 'expected a JSON object')
  const values = parsed as RawConfig
  for (const key of ['agentChecks', 'capturePrompts', 'receipts', 'recall'] as const) {
    if (key in values && typeof values[key] !== 'boolean') throw new InvalidConfigError(path, `${key} must be true or false`)
  }
  const patterns = values.redactPatterns
  if (patterns !== undefined && !(Array.isArray(patterns) && patterns.every((pattern) => typeof pattern === 'string'))) {
    throw new InvalidConfigError(path, 'redactPatterns must be a list of strings')
  }
  // A pattern that cannot be used would mask nothing, so what it was meant to hide would be stored;
  // one that could backtrack for minutes would freeze every hook that applies it.
  const unusable = ((patterns as string[] | undefined) ?? []).flatMap((pattern) => {
    const reason = unusablePattern(pattern)
    return reason ? [`${pattern}: ${reason}`] : []
  })
  if (unusable.length > 0) throw new InvalidConfigError(path, `a redactPatterns entry cannot be used (${unusable.join(' ')})`)
  return values
}

function withDefaults(values: RawConfig): ContinuumConfig {
  return {
    agentChecks: (values.agentChecks as boolean | undefined) ?? DEFAULT_CONFIG.agentChecks,
    capturePrompts: (values.capturePrompts as boolean | undefined) ?? DEFAULT_CONFIG.capturePrompts,
    redactPatterns: (values.redactPatterns as string[] | undefined) ?? [...DEFAULT_CONFIG.redactPatterns],
    receipts: (values.receipts as boolean | undefined) ?? DEFAULT_CONFIG.receipts,
    recall: (values.recall as boolean | undefined) ?? DEFAULT_CONFIG.recall,
  }
}

/** Missing settings take the defaults; a config that cannot be read throws InvalidConfigError. */
export async function readConfig(root: string): Promise<ContinuumConfig> {
  return withDefaults(await readRawConfig(root))
}

/** The built-in rules plus this repository's own patterns. Everything stored from the repository goes through it. */
export async function repositoryRedactor(root: string): Promise<Redactor> {
  return createRedactor((await readConfig(root)).redactPatterns)
}

/** Changes settings, keeping everything else in the file. Refuses to write over a config it cannot read. */
export async function updateConfig(root: string, change: Partial<ContinuumConfig>): Promise<ContinuumConfig> {
  const raw = await readRawConfig(root)
  const next = { ...raw, ...withDefaults(raw), ...change }
  const path = configPath(root)
  // Unique per write: the dashboard's server can save twice at once.
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
  return withDefaults(next)
}
