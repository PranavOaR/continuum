import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NotFoundError, type ContinuumService } from '@continuum/core'
import { afterEach, describe, expect, it } from 'vitest'
import { PortInUseError, startDaemon, type RunningDaemon } from '../server'

const running: RunningDaemon[] = []
const dirs: string[] = []
afterEach(async () => {
  for (const daemon of running.splice(0)) await daemon.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const errors: unknown[] = []
const fakeService: ContinuumService = {
  getOverview: async () => ({ projects: [], activeTaskCount: 0, changedFileCount: 3, recentEvents: [], attention: [] }),
  listProjects: async () => [],
  listTasks: async () => [],
  listActivity: async () => [],
  getWorkspace: async (id) => {
    if (id === 'boom') throw new Error('disk on fire at /secret/path')
    throw new NotFoundError('Project', id)
  },
  getMemoryGraph: async (id) => ({ projectId: id, nodes: [], edges: [] }),
  getBriefing: async (id) => `# Continuum handoff: ${id}`,
  search: async (query) => [{ id: query, kind: 'project', title: query, subtitle: '', to: '/' }],
}

function webBuild() {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-web-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><title>Continuum</title></head><body></body></html>')
  writeFileSync(join(dir, 'assets', 'app-123.js'), 'console.log(1)')
  writeFileSync(join(dir, '..', 'outside-secret.txt'), 'secret')
  return dir
}

async function start(staticDir?: string) {
  const daemon = await startDaemon({ service: fakeService, version: 'test', port: 0, staticDir, onError: (error) => errors.push(error) })
  running.push(daemon)
  return daemon
}

/** Raw request, so tests control Host and Origin exactly. */
function raw(daemon: RunningDaemon, path: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: daemon.port, path, method, headers: { host: `127.0.0.1:${daemon.port}`, ...headers } }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('daemon API', () => {
  it('serves health and service data in a data envelope', async () => {
    const daemon = await start()
    expect(daemon.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(JSON.parse((await raw(daemon, '/api/health')).body)).toEqual({ data: { ok: true, mode: 'local' } })
    expect(JSON.parse((await raw(daemon, '/api/overview')).body).data.changedFileCount).toBe(3)
    expect(JSON.parse((await raw(daemon, '/api/projects/acme/graph')).body).data.projectId).toBe('acme')
    expect(JSON.parse((await raw(daemon, '/api/search?q=auth')).body).data[0].title).toBe('auth')
    expect(JSON.parse((await raw(daemon, '/api/projects/acme/briefing')).body).data).toBe('# Continuum handoff: acme')
    expect(JSON.parse((await raw(daemon, '/api/projects/my%20app/graph')).body).data.projectId).toBe('my app')
  })

  it('maps errors to statuses without leaking internals', async () => {
    const daemon = await start()
    const missing = await raw(daemon, '/api/projects/nope/workspace')
    expect(missing.status).toBe(404)
    expect(JSON.parse(missing.body).error).toEqual({ code: 'not-found', message: expect.stringContaining('"nope"') })
    const broken = await raw(daemon, '/api/projects/boom/workspace')
    expect(broken.status).toBe(500)
    expect(broken.body).not.toContain('/secret/path')
    expect(errors.at(-1)).toBeInstanceOf(Error)
    expect((await raw(daemon, '/api/unknown')).status).toBe(404)
    expect((await raw(daemon, '/api/projects/%E0%A4%A/workspace')).status).toBe(400)
  })

  it('rejects other hosts and origins, and anything but reads', async () => {
    const daemon = await start()
    expect((await raw(daemon, '/api/health', { host: 'evil.example:80' })).status).toBe(403)
    expect((await raw(daemon, '/api/health', { origin: 'https://evil.example' })).status).toBe(403)
    expect((await raw(daemon, '/api/health', { host: `localhost:${daemon.port}`, origin: `http://localhost:${daemon.port}` })).status).toBe(200)
    expect((await raw(daemon, '/api/overview', {}, 'POST')).status).toBe(405)
    const ok = await raw(daemon, '/api/overview')
    expect(ok.headers['cache-control']).toBe('no-store')
    expect(ok.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('reports a port that is already taken', async () => {
    const daemon = await start()
    await expect(startDaemon({ service: fakeService, version: 'test', port: daemon.port })).rejects.toBeInstanceOf(PortInUseError)
  })
})

describe('daemon static files', () => {
  it('serves the app shell for client routes and assets with long caching', async () => {
    const daemon = await start(webBuild())
    const shell = await raw(daemon, '/app/projects/acme')
    expect(shell.status).toBe(200)
    expect(shell.body).toContain('<title>Continuum</title>')
    expect(shell.headers['content-security-policy']).toContain("default-src 'self'")
    expect(shell.body).toContain('<meta name="continuum-data" content="local"></head>')
    const asset = await raw(daemon, '/assets/app-123.js')
    expect(asset.headers['content-type']).toContain('text/javascript')
    expect(asset.headers['cache-control']).toContain('immutable')
    expect((await raw(daemon, '/assets/missing.js')).status).toBe(404)
  })

  it('never serves files outside the build directory', async () => {
    const daemon = await start(webBuild())
    for (const path of ['/../outside-secret.txt', '/%2e%2e/outside-secret.txt', '/assets/..%2f..%2foutside-secret.txt', '/%00.txt']) {
      const response = await raw(daemon, path)
      expect(response.body).not.toContain('secret')
    }
  })

  it('explains how to build the dashboard when it is missing', async () => {
    const daemon = await start()
    const response = await raw(daemon, '/')
    expect(response.status).toBe(404)
    expect(response.body).toContain('npm run build')
  })
})
