import { NotFoundError } from '@continuum/core'
import { describe, expect, it } from 'vitest'
import { readDataMode } from '../services/dataMode'
import { ApiError, createHttpContinuumService } from '../services/httpContinuumService'

function respond(status: number, body: unknown, contentType = 'application/json; charset=utf-8') {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': contentType } })
}

const fetchReturning = (response: () => Response | Promise<Response>) => (async () => response()) as unknown as typeof fetch

describe('readDataMode', () => {
  const page = (meta?: string) => {
    const doc = document.implementation.createHTMLDocument('t')
    if (meta !== undefined) doc.head.insertAdjacentHTML('beforeend', `<meta name="continuum-data" content="${meta}">`)
    return doc
  }

  it('is local only when continuum serve marked the page', () => {
    expect(readDataMode(page('local'), undefined)).toBe('local')
    expect(readDataMode(page(), undefined)).toBe('demo')
    expect(readDataMode(page('other'), undefined)).toBe('demo')
    expect(readDataMode(undefined, undefined)).toBe('demo')
  })

  it('can be forced to local during development', () => {
    expect(readDataMode(page(), 'local')).toBe('local')
  })
})

describe('createHttpContinuumService', () => {
  it('reads data from the envelope and encodes path segments', async () => {
    const urls: string[] = []
    const fetchImpl = (async (url: string) => {
      urls.push(url)
      return respond(200, { data: { projectId: 'my app', nodes: [], edges: [] } })
    }) as unknown as typeof fetch
    const service = createHttpContinuumService(fetchImpl)
    expect((await service.getMemoryGraph('my app')).projectId).toBe('my app')
    await service.search('a&b')
    expect(urls).toEqual(['/api/projects/my%20app/graph', '/api/search?q=a%26b'])
  })

  it('asks the server for each newer view at its own address, writing settings and the profile as JSON', async () => {
    const calls: { url: string; method: string; body?: string }[] = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', ...(init?.body ? { body: String(init.body) } : {}) })
      return respond(200, { data: {} })
    }) as unknown as typeof fetch
    const service = createHttpContinuumService(fetchImpl, '', () => 'csrf')
    await service.getTaskReplay('my app', 'task 1')
    await service.listActivityPage('acme', { before: 120, type: 'decision' })
    await service.listActivityPage('acme', {})
    await service.getSettings('acme')
    await service.updateSettings('acme', { recall: false })
    await service.previewRedaction('acme', ['ACME-[0-9]+'], 'ACME-1')
    await service.getProfile()
    await service.updateProfile(['Use pnpm'])
    expect(calls).toEqual([
      { url: '/api/projects/my%20app/tasks/task%201/replay', method: 'GET' },
      { url: '/api/projects/acme/activity?before=120&type=decision', method: 'GET' },
      { url: '/api/projects/acme/activity', method: 'GET' },
      { url: '/api/projects/acme/settings', method: 'GET' },
      { url: '/api/projects/acme/settings', method: 'POST', body: '{"recall":false}' },
      { url: '/api/projects/acme/settings/preview', method: 'POST', body: '{"patterns":["ACME-[0-9]+"],"sample":"ACME-1"}' },
      { url: '/api/profile', method: 'GET' },
      { url: '/api/profile', method: 'POST', body: '{"preferences":["Use pnpm"]}' },
    ])
  })

  it('turns not-found into NotFoundError and other failures into readable errors', async () => {
    const notFound = createHttpContinuumService(fetchReturning(() => respond(404, { error: { code: 'not-found', message: 'Project "x" was not found.' } })))
    await expect(notFound.getWorkspace('x')).rejects.toBeInstanceOf(NotFoundError)
    const broken = createHttpContinuumService(fetchReturning(() => respond(500, { error: { code: 'internal', message: 'Continuum could not read this repository.' } })))
    await expect(broken.getOverview()).rejects.toThrow('Continuum could not read this repository.')
    const garbage = createHttpContinuumService(fetchReturning(() => respond(502, 'Bad gateway', 'text/plain')))
    await expect(garbage.listProjects()).rejects.toBeInstanceOf(ApiError)
  })
})
