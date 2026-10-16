import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import type { Writable } from 'node:stream'
import type { CheckRecordedEvent, CheckStatus, ContentHash, IdentityKey } from '@continuum/core'
import { keys, type ContextStore } from '@continuum/store'
import { scanRepository } from './scan'

export const RUN_SOURCE = 'cli:run'
/** Upper bound on stored output, so a noisy test run cannot bloat the event log. */
export const MAX_OUTPUT_TAIL_CHARS = 4000
const SIGNAL_EXIT_BASE = 128
const ANSI_ESCAPE = new RegExp(String.raw`\u001b\[[0-9;?]*[ -/]*[@-~]`, 'g')

export class CommandNotFoundError extends Error {
  constructor(command: string) {
    super(`Command not found: ${command}`)
    this.name = 'CommandNotFoundError'
  }
}

export interface RunCheckOptions {
  root: string
  command: string
  args: readonly string[]
  /** Stable name for the check; defaults to the full command line. */
  name?: string
  stdout?: Writable
  stderr?: Writable
  now?: () => Date
}

export interface RunCheckResult {
  name: string
  exitCode: number
  durationMs: number
  status: CheckStatus
}

interface ProcessOutcome {
  exitCode: number
  output: string
}

function keepTail(text: string): string {
  return text.length > MAX_OUTPUT_TAIL_CHARS ? text.slice(-MAX_OUTPUT_TAIL_CHARS) : text
}

function exitCodeOf(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) return code
  return SIGNAL_EXIT_BASE + (signal ? (constants.signals[signal] ?? 0) : 0)
}

/** Runs the command without a shell, teeing its output to the given streams and keeping a bounded tail. */
function execute(options: RunCheckOptions): Promise<ProcessOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, { cwd: options.root, stdio: ['inherit', 'pipe', 'pipe'] })
    let tail = ''
    const capture = (target: Writable | undefined) => (chunk: Buffer) => {
      target?.write(chunk)
      tail = keepTail(tail + chunk.toString('utf8'))
    }
    child.stdout?.on('data', capture(options.stdout ?? process.stdout))
    child.stderr?.on('data', capture(options.stderr ?? process.stderr))
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'ENOENT' ? new CommandNotFoundError(options.command) : error)
    })
    child.on('close', (code, signal) => {
      resolve({ exitCode: exitCodeOf(code, signal), output: keepTail(tail.replace(ANSI_ESCAPE, '').trim()) })
    })
  })
}

function coverage(files: ReadonlyMap<string, ContentHash>): Record<IdentityKey, ContentHash> {
  return Object.fromEntries([...files].map(([path, hash]) => [keys.file(path), hash]))
}

/**
 * Runs a check (tests, lint, build) and records it as verified evidence tied to
 * the exact content hashes it ran against. Changes the command makes itself are
 * captured afterwards, so the result is reported out of date rather than passed.
 */
export async function runCheck(store: ContextStore, options: RunCheckOptions): Promise<RunCheckResult> {
  const now = options.now ?? (() => new Date())
  const name = options.name ?? [options.command, ...options.args].join(' ')
  const { tree } = await scanRepository(store, options.root, { now })
  const startedAt = now()
  const outcome = await execute(options)
  const durationMs = Math.max(0, now().getTime() - startedAt.getTime())
  const event: CheckRecordedEvent = {
    type: 'check.recorded',
    payload: {
      name,
      command: [options.command, ...options.args].join(' '),
      exitCode: outcome.exitCode,
      durationMs,
      ranAgainst: coverage(tree.files),
      ...(outcome.output ? { outputTail: outcome.output } : {}),
    },
    evidence: 'verified',
    source: RUN_SOURCE,
    occurredAt: startedAt.toISOString(),
    ...(tree.revision ? { revision: tree.revision } : {}),
  }
  store.record(event)
  await scanRepository(store, options.root, { now })
  return { name, exitCode: outcome.exitCode, durationMs, status: store.checkStatus(name).status }
}
