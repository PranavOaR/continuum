import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ContextStore } from '../contextStore'
import { inspectStore } from '../inspect'
import { LATEST_SCHEMA_VERSION } from '../migrations'
import { ev } from './fixtures'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function storeAt(): string {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-inspect-'))
  dirs.push(dir)
  return join(dir, 'context.db')
}

describe('inspectStore', () => {
  it('reports the schema, the events by type and the latest activity without their contents', () => {
    const path = storeAt()
    const store = ContextStore.open(path)
    store.recordAll([ev.sessionStart('s1'), ev.file('a.ts', 'h1', { sessionId: 's1' }), ev.file('b.ts', 'h2', { sessionId: 's1' }), ev.check('npm test', 0, {})])
    store.close()

    const info = inspectStore(path)

    expect(info).toMatchObject({ schemaVersion: LATEST_SCHEMA_VERSION, events: 4, eventTypes: { 'session.started': 1, 'file.changed': 2, 'check.recorded': 1 } })
    expect(info.lastActivity).toEqual(expect.any(String))
  })

  it('reports an empty store', () => {
    const path = storeAt()
    ContextStore.open(path).close()
    expect(inspectStore(path)).toMatchObject({ events: 0, eventTypes: {}, lastActivity: null })
  })
})
