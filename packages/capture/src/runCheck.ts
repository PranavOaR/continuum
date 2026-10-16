import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import type { Writable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import type { CheckRecordedEvent, CheckStatus, ContentHash, IdentityKey } from '@continuum/core'
import { keys, type ContextStore } from '@continuum/store'
import { redactSecrets } from './redact'
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

/** The run was stopped (Ctrl-C, SIGTERM). An interrupted run proves nothing, so it is not recorded. */
export class CheckInterruptedError extends Error {
  readonly exitCode: number
  constructor(exitCode: number) {
    super('Interrupted; nothing was recorded.')
    this.name = 'CheckInterruptedError'
    this.exitCode = exitCode
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
  /** Aborting stops the command (SIGTERM) and records nothing. */
  signal?: AbortSignal
}

export interface RunCheckResult {
  name: string
  exitCode: number
  durationMs: number
  status: CheckStatus
  /** Set when the run was recorded but the follow-up scan failed. */
  warning?: string
}

interface ProcessOutcome {
  exitCode: number
  output: string
  interrupted: boolean
}

/** Raw output kept while running; extra room so ANSI stripping and redaction work on whole sequences. */
const RAW_TAIL_CHARS = MAX_OUTPUT_TAIL_CHARS * 2
const LOW_SURROGATE = /^[\uDC00-\uDFFF]/

function keep(text: string, limit: number): string {
  return text.length > limit ? text.slice(-limit) : text
}

/** Clean, redacted, bounded tail; never starts with half a surrogate pair. */
export function finalizeTail(raw: string): string {
  const cleaned = redactSecrets(raw.replace(ANSI_ESCAPE, '')).trim()
  return keep(cleaned, MAX_OUTPUT_TAIL_CHARS).replace(LOW_SURROGATE, '')
}

/** Forwards output until the destination fails (e.g. EPIPE from `| head`); the run itself carries on. */
function forwarder(target: Writable | undefined): (chunk: Buffer) => void {
  let healthy = target !== undefined
  target?.once('error', () => {
    healthy = false
  })
  return (chunk) => {
    if (!healthy) return
    try {
      target?.write(chunk)
    } catch {
      healthy = false
    }
  }
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
    let interrupted = false
    const stop = () => {
      interrupted = true
      child.kill('SIGTERM')
    }
    if (options.signal?.aborted) stop()
    options.signal?.addEventListener('abort', stop, { once: true })
    const capture = (target: Writable | undefined) => {
      const decoder = new StringDecoder('utf8') // keeps multibyte characters split across chunks intact
      const forward = forwarder(target)
      return (chunk: Buffer) => {
        forward(chunk)
        tail = keep(tail + decoder.write(chunk), RAW_TAIL_CHARS)
      }
    }
    child.stdout?.on('data', capture(options.stdout ?? process.stdout))
    child.stderr?.on('data', capture(options.stderr ?? process.stderr))
    child.on('error', (error: NodeJS.ErrnoException) => {
      options.signal?.removeEventListener('abort', stop)
      reject(error.code === 'ENOENT' ? new CommandNotFoundError(options.command) : error)
    })
    child.on('close', (code, signal) => {
      options.signal?.removeEventListener('abort', stop)
      resolve({ exitCode: exitCodeOf(code, signal), output: finalizeTail(tail), interrupted })
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
  const commandLine = redactSecrets([options.command, ...options.args].join(' '))
  const name = redactSecrets(options.name ?? commandLine)
  const { tree } = await scanRepository(store, options.root, { now })
  const startedAt = now()
  const outcome = await execute(options)
  if (outcome.interrupted) throw new CheckInterruptedError(outcome.exitCode)
  const durationMs = Math.max(0, now().getTime() - startedAt.getTime())
  const event: CheckRecordedEvent = {
    type: 'check.recorded',
    payload: {
      name,
      command: commandLine,
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
  const result: RunCheckResult = { name, exitCode: outcome.exitCode, durationMs, status: 'unknown' }
  try {
    await scanRepository(store, options.root, { now })
  } catch (error) {
    // The run is recorded; losing its exit code over a follow-up scan would be worse.
    const reason = error instanceof Error ? error.message : String(error)
    return { ...result, status: store.checkStatus(name).status, warning: `Could not rescan after the run: ${reason}` }
  }
  return { ...result, status: store.checkStatus(name).status }
}
