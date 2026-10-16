import type { DatabaseSync } from 'node:sqlite'

/** The version `SCHEMA` creates; every later version is reached through a migration. */
const BASE_SCHEMA_VERSION = 1

/** One forward-only step: the SQL that takes a store from `version - 1` to `version`. */
export interface Migration {
  version: number
  description: string
  sql: string
}

/** Append-only: never edit a released migration, add a new one instead. */
export const MIGRATIONS: readonly Migration[] = []

export const LATEST_SCHEMA_VERSION = BASE_SCHEMA_VERSION + MIGRATIONS.length

export class StoreVersionError extends Error {
  constructor(found: number, supported: number) {
    super(
      `This repository's Continuum store has schema version ${found}, which was written by a newer version of Continuum ` +
        `(this one supports up to ${supported}). Upgrade Continuum to read it; the store was not changed.`,
    )
    this.name = 'StoreVersionError'
  }
}

export function readSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined
  return row ? Number(row.value) : BASE_SCHEMA_VERSION
}

function assertSequential(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== BASE_SCHEMA_VERSION + index + 1) throw new Error(`Migration "${migration.description}" is out of order.`)
  })
}

/**
 * Brings a store up to the latest schema in one transaction: every pending
 * migration applies, or none does. The version is re-read under the write
 * lock, so two processes opening the same store migrate it once.
 */
export function migrate(db: DatabaseSync, migrations: readonly Migration[] = MIGRATIONS): { from: number; to: number } {
  assertSequential(migrations)
  const latest = BASE_SCHEMA_VERSION + migrations.length
  const from = readSchemaVersion(db)
  if (from > latest) throw new StoreVersionError(from, latest)
  if (from === latest) return { from, to: latest }
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const migration of migrations.filter((candidate) => candidate.version > readSchemaVersion(db))) {
      db.exec(migration.sql)
      db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)").run(String(migration.version))
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { from, to: latest }
}
