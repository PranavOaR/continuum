/**
 * Minimal browser-local persistence for demo preferences and handoff history.
 * Kept behind this interface so it can later be swapped for API calls.
 */
export interface PersistentStore<T> {
  load(): T
  save(value: T): void
  clear(): void
}

const NAMESPACE = 'continuum.demo.v1'

export function createPersistentStore<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): PersistentStore<T> {
  const storageKey = `${NAMESPACE}.${key}`

  return {
    load() {
      try {
        const raw = window.localStorage.getItem(storageKey)
        if (raw === null) return fallback
        const parsed: unknown = JSON.parse(raw)
        return isValid(parsed) ? parsed : fallback
      } catch {
        // Storage can be unavailable (private mode, blocked site data); the demo still works without it.
        return fallback
      }
    },
    save(value) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(value))
      } catch (error) {
        console.warn(`[continuum] Could not persist "${key}"; changes will last for this session only.`, error)
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        // Nothing to clear if storage is unavailable.
      }
    },
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
