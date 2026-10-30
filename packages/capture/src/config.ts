import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CONTINUUM_DIR } from './git'
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
}

export const DEFAULT_CONFIG: Readonly<ContinuumConfig> = { agentChecks: true, capturePrompts: false, redactPatterns: [] }

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
  for (const key of ['agentChecks', 'capturePrompts'] as const) {
    if (key in values && typeof values[key] !== 'boolean') throw new InvalidConfigError(path, `${key} must be true or false`)
  }
  const patterns = values.redactPatterns
  if (patterns !== undefined && !(Array.isArray(patterns) && patterns.every((pattern) => typeof pattern === 'string'))) {
    throw new InvalidConfigError(path, 'redactPatterns must be a list of strings')
  }
  return values
}

function withDefaults(values: RawConfig): ContinuumConfig {
  return {
    agentChecks: (values.agentChecks as boolean | undefined) ?? DEFAULT_CONFIG.agentChecks,
    capturePrompts: (values.capturePrompts as boolean | undefined) ?? DEFAULT_CONFIG.capturePrompts,
    redactPatterns: (values.redactPatterns as string[] | undefined) ?? [...DEFAULT_CONFIG.redactPatterns],
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
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
  return withDefaults(next)
}
