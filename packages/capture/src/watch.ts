import { watch, type FSWatcher } from 'node:fs'
import type { ContextStore } from '@continuum/store'
import { CONTINUUM_DIR } from './git'
import { scanRepository, type FileChange } from './scan'

export const DEFAULT_DEBOUNCE_MS = 300
/** Upper bound on how long continuous writes (a dev server, a log) can postpone a scan. */
export const DEFAULT_MAX_WAIT_MS = 2_000
/** Safety-net rescan: OS watchers can drop events (e.g. FSEvents while a stream warms up). */
export const DEFAULT_RECONCILE_MS = 60_000
/** Scan interval when the OS cannot watch the repository. Scans read clean files from the git index, so this stays cheap. */
export const DEFAULT_POLL_MS = 2_000
/** Watcher failures that mean "out of watch capacity" or "unsupported here", where polling still works. */
const POLLABLE_ERRORS = new Set(['ENOSPC', 'EMFILE', 'ENFILE', 'ENOSYS', 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM'])
const IGNORED_SEGMENTS = new Set(['.git', CONTINUUM_DIR, 'node_modules'])

export class WatchUnavailableError extends Error {
  constructor(root: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    super(`Cannot watch ${root}: ${reason}. Continuum needs Node 22.5+ and free file-watch capacity (on Linux, raise fs.inotify.max_user_watches).`)
    this.name = 'WatchUnavailableError'
    this.cause = cause
  }
}

/** Cheap pre-filter for watcher noise. The scan itself is authoritative (it respects .gitignore). */
export function isIgnoredPath(path: string): boolean {
  return path.split(/[\\/]/).some((segment) => IGNORED_SEGMENTS.has(segment))
}

export interface CaptureOptions {
  debounceMs?: number
  maxWaitMs?: number
  reconcileMs?: number
  pollMs?: number
  onChanges?: (changes: FileChange[]) => void
  onError?: (error: unknown) => void
  /** Called once when watching is unavailable and capture falls back to polling. */
  onPolling?: (reason: string) => void
  /** Credit changes to a session opened with `continuum session start`. */
  attributeToActiveSession?: boolean
  /** Injected in tests to simulate an OS without watch capacity. */
  openWatcher?: (root: string, onPath: (path: string | null) => void) => FSWatcher
}

export type CaptureMode = 'watching' | 'polling'

export interface CaptureHandle {
  /** Requests a scan now; coalesces with any scan already queued. */
  rescan(): Promise<void>
  /** Resolves once no scan is running or queued. */
  idle(): Promise<void>
  close(): Promise<void>
  /** How changes are being noticed right now. */
  readonly mode: CaptureMode
}

function watchRecursively(root: string, onPath: (path: string | null) => void): FSWatcher {
  return watch(root, { recursive: true }, (_event, filename) => onPath(filename ? filename.toString() : null))
}

function isPollable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && POLLABLE_ERRORS.has(code)
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Watches the repository, scans once, then rescans after each quiet period (at
 * most `maxWaitMs` apart under continuous writes) and on a slow reconcile timer.
 * The watcher starts before the first scan so changes made while it warms up are
 * still caught. Scans are serialized: a change during a scan queues exactly one
 * more. A failing first scan rejects, so callers never report a broken capture
 * as running.
 */
export async function startCapture(store: ContextStore, root: string, options: CaptureOptions = {}): Promise<CaptureHandle> {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
  let running: Promise<void> = Promise.resolve()
  let queued: Promise<void> | null = null
  let timer: NodeJS.Timeout | undefined
  let pendingSince: number | undefined
  let closed = false

  const report = (error: unknown) => {
    try {
      options.onError?.(error)
    } catch {
      // The reporter itself failed (e.g. stderr closed); there is nowhere left to report to.
    }
  }

  /** Every scan still running: close() waits for all of them, so none touches the store after it is closed. */
  const inFlight = new Set<Promise<void>>()

  const scan = (): Promise<void> => {
    if (closed) return Promise.resolve()
    const work = scanRepository(store, root, { attributeToActiveSession: options.attributeToActiveSession ?? false }).then(({ changes }) => {
      if (changes.length > 0 && !closed) options.onChanges?.(changes)
    })
    inFlight.add(work)
    const forget = () => inFlight.delete(work)
    work.then(forget, forget)
    return work
  }

  const rescan = (): Promise<void> => {
    if (queued) return queued
    const next = async () => {
      queued = null
      if (closed) return
      try {
        await scan()
      } catch (error) {
        report(error)
      }
    }
    // Runs after the previous scan whether it succeeded or failed: a failed first scan must not
    // turn every queued rescan into an unhandled rejection.
    queued = running.then(next, next)
    running = queued
    return queued
  }

  const schedule = () => {
    const now = Date.now()
    pendingSince ??= now
    const wait = Math.min(debounceMs, Math.max(0, pendingSince + maxWaitMs - now))
    clearTimeout(timer)
    timer = setTimeout(() => {
      pendingSince = undefined
      void rescan()
    }, wait)
  }

  let mode: CaptureMode = 'watching'
  let watcher: FSWatcher | null = null
  let reconcile: NodeJS.Timeout

  const startTimer = (ms: number) => {
    clearInterval(reconcile)
    reconcile = setInterval(() => void rescan(), ms)
    reconcile.unref()
  }

  /** Out of inotify watches (or no recursive watch at all): keep capturing by scanning on a short interval. */
  const fallBackToPolling = (error: unknown) => {
    if (mode === 'polling' || closed) return
    mode = 'polling'
    watcher?.close()
    watcher = null
    startTimer(options.pollMs ?? DEFAULT_POLL_MS)
    options.onPolling?.(messageOf(error))
  }

  try {
    watcher = (options.openWatcher ?? watchRecursively)(root, (path) => {
      if (closed || (path && isIgnoredPath(path))) return
      schedule()
    })
    watcher.on('error', (error) => (isPollable(error) ? fallBackToPolling(error) : report(error)))
    startTimer(options.reconcileMs ?? DEFAULT_RECONCILE_MS)
  } catch (error) {
    if (!isPollable(error)) throw new WatchUnavailableError(root, error)
    fallBackToPolling(error)
  }

  const stop = async () => {
    closed = true
    clearTimeout(timer)
    clearInterval(reconcile)
    watcher?.close()
    await Promise.allSettled([running, ...inFlight])
  }

  try {
    running = scan()
    await running
  } catch (error) {
    running = Promise.resolve()
    await stop()
    throw error
  }

  return {
    rescan,
    idle: async () => {
      while (queued) await queued
      await running
    },
    close: stop,
    get mode() {
      return mode
    },
  }
}
