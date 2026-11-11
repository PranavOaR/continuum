import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Whether a newer Continuum is on npm, said once after a command a person ran
 * at a terminal. It asks the npm registry for the latest version number at
 * most once a day, which sends npm the package name and this machine's
 * address, as `npx` itself does; nothing from any repository is sent. Agents,
 * pipes, CI and the commands agents run never ask, so it can never slow or
 * disturb a session.
 */
export const UPDATE_CHECK_FILE = 'update-check.json'
const DAY_MS = 86_400_000
/** How long a finished command waits for an answer before going on without one. */
const DEFAULT_WAIT_MS = 1_500
const REGISTRY_TIMEOUT_MS = 3_000
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/
const DEVELOPMENT_VERSION = '0.0.0-dev'
/** Agents run these, and `update` is the cure, not a place for the reminder. */
const SILENT_COMMANDS = new Set(['mcp', 'ingest', 'update', 'serve'])
const OFF_SWITCHES = ['CI', 'NO_UPDATE_NOTIFIER', 'CONTINUUM_NO_UPDATE_CHECK'] as const

interface State {
  checkedAt?: string
  latest?: string
  disabled?: boolean
}

export interface UpdateCheckOptions {
  version: string
  packageName: string
  configDir: string
  env: NodeJS.ProcessEnv
  /** A person is reading: stdout and stderr are both terminals. */
  isInteractive: boolean
  command: string | null
  now: () => Date
  fetchLatest: (packageName: string) => Promise<string>
  waitMs?: number
}

export interface UpdateCheck {
  /** The line to show once the command is done, or null. Never throws. */
  finish(): Promise<string | null>
}

/** Whether `candidate` is a later release than `current`, number by number. */
export function isNewer(candidate: string, current: string): boolean {
  if (!VERSION_PATTERN.test(candidate) || !VERSION_PATTERN.test(current)) return false
  const [a, b] = [candidate, current].map((version) => version.split('.').map(Number))
  const index = a.findIndex((part, position) => part !== b[position])
  return index !== -1 && a[index] > b[index]
}

const statePath = (configDir: string) => join(configDir, UPDATE_CHECK_FILE)

async function readState(configDir: string): Promise<State> {
  if (!existsSync(statePath(configDir))) return {}
  try {
    const parsed: unknown = JSON.parse(await readFile(statePath(configDir), 'utf8'))
    return typeof parsed === 'object' && parsed !== null ? (parsed as State) : {}
  } catch {
    return {}
  }
}

async function writeState(configDir: string, state: State): Promise<void> {
  await mkdir(configDir, { recursive: true, mode: 0o700 })
  // Unique per write: two commands can finish at once.
  const temporary = `${statePath(configDir)}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, statePath(configDir))
}

/** `continuum config update-check on|off`: kept with your other per-user state, for every repository. */
export async function setUpdateCheck(configDir: string, isEnabled: boolean): Promise<void> {
  const { disabled: _previous, ...rest } = await readState(configDir)
  await writeState(configDir, isEnabled ? rest : { ...rest, disabled: true })
}

export async function isUpdateCheckEnabled(configDir: string): Promise<boolean> {
  return (await readState(configDir)).disabled !== true
}

/** The latest version on npm, from the registry's small `latest` document. */
export async function fetchLatestFromNpm(packageName: string): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName).replace('%40', '@')}/latest`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`npm answered ${response.status}`)
  const { version } = (await response.json()) as { version?: unknown }
  if (typeof version !== 'string') throw new Error('npm sent no version')
  return version
}

const isEligible = (options: UpdateCheckOptions) =>
  options.isInteractive && options.version !== DEVELOPMENT_VERSION && !SILENT_COMMANDS.has(options.command ?? '') && !OFF_SWITCHES.some((name) => options.env[name])

/** Asks npm, unless it was asked today, and records the answer (or that it was asked) either way. */
async function refresh(options: UpdateCheckOptions, state: State): Promise<string | undefined> {
  const now = options.now()
  const isFresh = state.checkedAt !== undefined && now.getTime() - Date.parse(state.checkedAt) < DAY_MS
  if (isFresh) return state.latest
  const latest = await options.fetchLatest(options.packageName).then(
    (version) => (VERSION_PATTERN.test(version) ? version : undefined),
    () => undefined,
  )
  const next = { ...state, checkedAt: now.toISOString(), ...(latest ? { latest } : {}) }
  await writeState(options.configDir, next).catch(() => {})
  return next.latest
}

/**
 * Starts the check alongside the command, so it costs the command nothing;
 * `finish` waits a moment for the answer, then gives up for this run.
 */
export function startUpdateCheck(options: UpdateCheckOptions): UpdateCheck {
  if (!isEligible(options)) return { finish: async () => null }
  const answer = readState(options.configDir)
    .then((state) => (state.disabled ? undefined : refresh(options, state)))
    .catch(() => undefined)
  return {
    async finish() {
      let timer: NodeJS.Timeout | undefined
      const giveUp = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), options.waitMs ?? DEFAULT_WAIT_MS)
      })
      const latest = await Promise.race([answer, giveUp])
      clearTimeout(timer)
      if (!latest || !isNewer(latest, options.version)) return null
      return `Update available: Continuum ${options.version} → ${latest}. Run: npx ${options.packageName}@latest update`
    },
  }
}
