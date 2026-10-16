import { readSchemaVersion } from './migrations'

const { DatabaseSync } = process.getBuiltinModule('node:sqlite')

/** SQLite result codes meaning the file is not a usable database, as opposed to busy or unreadable. */
const SQLITE_CORRUPT = 11
const SQLITE_NOTADB = 26

export interface StoreInfo {
  schemaVersion: number
  events: number
  lastActivity: string | null
}

/** Reads a store's vital signs without migrating or writing anything, for diagnostics. */
export function inspectStore(path: string): StoreInfo {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const { events, last } = db.prepare('SELECT COUNT(*) AS events, MAX(occurred_at) AS last FROM events').get() as { events: number; last: string | null }
    return { schemaVersion: readSchemaVersion(db), events, lastActivity: last }
  } finally {
    db.close()
  }
}

/** Whether an error from opening a store means the file itself is damaged. */
export function isCorruptStoreError(error: unknown): boolean {
  const code = (error as { errcode?: unknown } | null)?.errcode
  return code === SQLITE_CORRUPT || code === SQLITE_NOTADB
}

/**
 * Whether another process is writing to the store right now. Idle readers and
 * watchers are not detected; callers should still ask users to stop them.
 */
export function isStoreBusy(path: string): boolean {
  const db = new DatabaseSync(path)
  try {
    db.exec('PRAGMA busy_timeout = 0')
    db.exec('BEGIN IMMEDIATE')
    db.exec('ROLLBACK')
    return false
  } catch {
    return true
  } finally {
    db.close()
  }
}
