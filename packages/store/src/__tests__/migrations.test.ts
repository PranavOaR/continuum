import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ContextStore } from '../contextStore'
import { LATEST_SCHEMA_VERSION, migrate, readSchemaVersion, StoreVersionError, type Migration } from '../migrations'
import { SCHEMA } from '../schema'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function baseDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(SCHEMA)
  return db
}

const ADD_NOTES: Migration = { version: 2, description: 'add notes', sql: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);' }
const ADD_NOTE_INDEX: Migration = { version: 3, description: 'index notes', sql: 'CREATE INDEX notes_by_body ON notes (body);' }

const tableNames = (db: DatabaseSync) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name").all() as { name: string }[]).map((row) => row.name)

describe('store migrations', () => {
  it('starts a new store at the latest schema version', () => {
    const store = ContextStore.open(':memory:')
    expect(store.schemaVersion()).toBe(LATEST_SCHEMA_VERSION)
    store.close()
  })

  it('applies every pending migration in order and records the version', () => {
    const db = baseDb()
    expect(migrate(db, [ADD_NOTES, ADD_NOTE_INDEX])).toEqual({ from: 1, to: 3 })
    expect(readSchemaVersion(db)).toBe(3)
    expect(tableNames(db)).toEqual(expect.arrayContaining(['notes', 'notes_by_body']))
  })

  it('only applies migrations newer than the stored version', () => {
    const db = baseDb()
    migrate(db, [ADD_NOTES])
    expect(migrate(db, [ADD_NOTES, ADD_NOTE_INDEX])).toEqual({ from: 2, to: 3 })
    expect(migrate(db, [ADD_NOTES, ADD_NOTE_INDEX])).toEqual({ from: 3, to: 3 })
  })

  it('leaves the store untouched when a migration fails', () => {
    const db = baseDb()
    const broken: Migration = { version: 3, description: 'broken', sql: 'CREATE TABLE half (id INTEGER); THIS IS NOT SQL;' }
    expect(() => migrate(db, [ADD_NOTES, broken])).toThrow()
    expect(readSchemaVersion(db)).toBe(1)
    expect(tableNames(db)).not.toContain('notes')
    expect(tableNames(db)).not.toContain('half')
  })

  it('refuses a store written by a newer version of Continuum', () => {
    const db = baseDb()
    db.prepare("UPDATE meta SET value = '99' WHERE key = 'schema_version'").run()
    expect(() => migrate(db, [])).toThrow(StoreVersionError)
    expect(() => migrate(db, [])).toThrow(/newer version of Continuum/)
  })

  it('rejects migrations that skip or repeat a version', () => {
    expect(() => migrate(baseDb(), [ADD_NOTE_INDEX])).toThrow(/out of order/)
  })

  it('refuses to open a newer store from disk without changing it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'continuum-migrate-'))
    dirs.push(dir)
    const path = join(dir, 'context.db')
    ContextStore.open(path).close()
    const raw = new DatabaseSync(path)
    raw.prepare("UPDATE meta SET value = '99' WHERE key = 'schema_version'").run()
    raw.close()
    expect(() => ContextStore.open(path)).toThrow(StoreVersionError)
    const check = new DatabaseSync(path)
    expect(readSchemaVersion(check)).toBe(99)
    check.close()
  })
})
