import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ContinuumService } from '@continuum/core'
import { ContextStore } from '@continuum/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChangeFeed } from '../changeFeed'
import { startDaemon, type RunningDaemon } from '../server'

const dirs: string[] = []
const daemons: RunningDaemon[] = []
afterEach(async () => {
  for (const daemon of daemons.splice(0)) await daemon.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function storeFile() {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-feed-'))
  dirs.push(dir)
  const path = join(dir, 'context.db')
  ContextStore.open(path).close()
  return path
}

/** A commit from another process, as a hook or `continuum run` would make. */
function recordSomething(path: string) {
  const store = ContextStore.open(path)
  store.record({ type: 'session.started', payload: { sessionId: `s-${Math.random()}`, agent: 'claude-code' }, evidence: 'observed', source: 'test', occurredAt: new Date().toISOString() })
  store.close()
}

describe('createChangeFeed', () => {
  it('reports the projects whose store changed, and calls onChange first', async () => {
    const [a, b] = [storeFile(), storeFile()]
    const order: string[] = []
    const feed = createChangeFeed(
      [
        { projectId: 'a', storePath: a },
        { projectId: 'b', storePath: b },
      ],
      { pollMs: 20, onChange: () => order.push('onChange') },
    )
    const seen: string[][] = []
    const unsubscribe = feed.subscribe((ids) => {
      order.push('listener')
      seen.push(ids)
    })
    await new Promise((done) => setTimeout(done, 60))
    recordSomething(b)
    await vi.waitFor(() => expect(seen).toEqual([['b']]))
    expect(order).toEqual(['onChange', 'listener'])
    unsubscribe()
  })

  it('ignores connections that only read, like the dashboard loading a snapshot', async () => {
    const path = storeFile()
    const onChange = vi.fn()
    const feed = createChangeFeed([{ projectId: 'a', storePath: path }], { pollMs: 10, onChange })
    const unsubscribe = feed.subscribe(() => {})
    for (let read = 0; read < 5; read += 1) {
      const reader = ContextStore.open(path)
      reader.eventCount()
      reader.close()
      await new Promise((done) => setTimeout(done, 15))
    }
    expect(onChange).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('does not poll while nobody is listening', async () => {
    const path = storeFile()
    const onChange = vi.fn()
    const feed = createChangeFeed([{ projectId: 'a', storePath: path }], { pollMs: 10, onChange })
    feed.subscribe(() => {})()
    recordSomething(path)
    await new Promise((done) => setTimeout(done, 60))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('GET /api/events', () => {
  const TOKEN = 'feed-test-token'

  function openStream(daemon: RunningDaemon, onData: (text: string) => void, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) {
    return new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: daemon.port, path: '/api/events', headers: { host: `127.0.0.1:${daemon.port}`, ...headers } }, (res) => {
        res.setEncoding('utf8')
        res.on('data', onData)
        resolve(res.statusCode ?? 0)
      })
      req.on('error', reject)
      req.end()
    })
  }

  it('streams a change event to an authorized dashboard', async () => {
    const path = storeFile()
    const changes = createChangeFeed([{ projectId: 'acme', storePath: path }], { pollMs: 20 })
    const daemon = await startDaemon({ service: {} as ContinuumService, version: 'test', token: TOKEN, port: 0, changes })
    daemons.push(daemon)
    let received = ''
    expect(await openStream(daemon, (text) => (received += text))).toBe(200)
    await new Promise((done) => setTimeout(done, 60))
    recordSomething(path)
    await vi.waitFor(() => expect(received).toContain('event: change\ndata: {"projectIds":["acme"]}'))
  })

  it('requires the access token like every other route', async () => {
    const daemon = await startDaemon({ service: {} as ContinuumService, version: 'test', token: TOKEN, port: 0, changes: createChangeFeed([]) })
    daemons.push(daemon)
    expect(await openStream(daemon, () => {}, {})).toBe(401)
  })
})
