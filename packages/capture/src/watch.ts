import { watch, type FSWatcher } from 'node:fs'
import type { ContextStore } from '@continuum/store'
import { CONTINUUM_DIR } from './git'
import { scanRepository, type FileChange } from './scan'

export const DEFAULT_DEBOUNCE_MS = 300
/** Upper bound on how long continuous writes (a dev server, a log) can postpone a scan. */
export const DEFAULT_MAX_WAIT_MS = 2_000
/** Safety-net rescan: OS watchers can drop events (e.g. FSEvents while a stream warms up). */
export const DEFAULT_RECONCILE_MS = 60_000
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
  onChanges?: (changes: FileChange[]) => void
  onError?: (error: unknown) => void
}

export interface CaptureHandle {
  /** Requests a scan now; coalesces with any scan already queued. */
  rescan(): Promise<void>
  /** Resolves once no scan is running or queued. */
  idle(): Promise<void>
  close(): Promise<void>
}

function openWatcher(root: string, onPath: (path: string | null) => void): FSWatcher {
  try {
    return watch(root, { recursive: true }, (_event, filename) => onPath(filename ? filename.toString() : null))
  } catch (error) {
    throw new WatchUnavailableError(root, error)
  }
}

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

  const scan = async () => {
    const { changes } = await scanRepository(store, root)
    if (changes.length > 0) options.onChanges?.(changes)
  }

  const rescan = (): Promise<void> => {
    if (queued) return queued
    queued = running.then(async () => {
      queued = null
      if (closed) return
      try {
        await scan()
      } catch (error) {
        report(error)
      }
    })
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

  const watcher = openWatcher(root, (path) => {
    if (closed || (path && isIgnoredPath(path))) return
    schedule()
  })
  watcher.on('error', report)
  const reconcile = setInterval(() => void rescan(), options.reconcileMs ?? DEFAULT_RECONCILE_MS)
  reconcile.unref()

  const stop = async () => {
    closed = true
    clearTimeout(timer)
    clearInterval(reconcile)
    watcher.close()
    await running
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
  }
}
