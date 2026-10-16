import { watch, type FSWatcher } from 'node:fs'
import type { ContextStore } from '@continuum/store'
import { CONTINUUM_DIR } from './git'
import { scanRepository, type FileChange } from './scan'

export const DEFAULT_DEBOUNCE_MS = 300
/** Safety-net rescan: OS watchers can drop events (e.g. FSEvents while a stream warms up). */
export const DEFAULT_RECONCILE_MS = 60_000
const IGNORED_SEGMENTS = new Set(['.git', CONTINUUM_DIR, 'node_modules'])

/** Cheap pre-filter for watcher noise. The scan itself is authoritative (it respects .gitignore). */
export function isIgnoredPath(path: string): boolean {
  return path.split(/[\\/]/).some((segment) => IGNORED_SEGMENTS.has(segment))
}

export interface CaptureOptions {
  debounceMs?: number
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

/**
 * Watches the repository, scans once, then rescans after each quiet period and
 * on a slow reconcile timer. The watcher starts before the first scan so changes
 * made while it warms up are still caught. Scans are serialized: a change during
 * a scan queues exactly one more.
 */
export async function startCapture(store: ContextStore, root: string, options: CaptureOptions = {}): Promise<CaptureHandle> {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  let running: Promise<void> = Promise.resolve()
  let queued: Promise<void> | null = null
  let timer: NodeJS.Timeout | undefined
  let closed = false

  const scanOnce = async () => {
    if (closed) return
    try {
      const { changes } = await scanRepository(store, root)
      if (changes.length > 0) options.onChanges?.(changes)
    } catch (error) {
      options.onError?.(error)
    }
  }

  const rescan = (): Promise<void> => {
    if (queued) return queued
    queued = running.then(() => {
      queued = null
      return scanOnce()
    })
    running = queued
    return queued
  }

  const watcher: FSWatcher = watch(root, { recursive: true }, (_event, filename) => {
    if (closed || (filename && isIgnoredPath(filename.toString()))) return
    clearTimeout(timer)
    timer = setTimeout(() => void rescan(), debounceMs)
  })
  watcher.on('error', (error) => options.onError?.(error))
  const reconcile = setInterval(() => void rescan(), options.reconcileMs ?? DEFAULT_RECONCILE_MS)
  reconcile.unref()

  await rescan()

  return {
    rescan,
    idle: async () => {
      while (queued) await queued
      await running
    },
    close: async () => {
      closed = true
      clearTimeout(timer)
      clearInterval(reconcile)
      watcher.close()
      await running
    },
  }
}
