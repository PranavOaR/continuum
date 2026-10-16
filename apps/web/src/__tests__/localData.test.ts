import { NotFoundError } from '@continuum/core'
import { describe, expect, it } from 'vitest'
import { detectDataMode } from '../services/dataMode'
import { ApiError, createHttpContinuumService } from '../services/httpContinuumService'

function respond(status: number, body: unknown, contentType = 'application/json; charset=utf-8') {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': contentType } })
}

const fetchReturning = (response: () => Response | Promise<Response>) => (async () => response()) as unknown as typeof fetch

describe('detectDataMode', () => {
  it('is local only when a Continuum daemon answers the health check', async () => {
    expect(await detectDataMode(fetchReturning(() => respond(200, { data: { ok: true, mode: 'local' } })))).toBe('local')
  })

  it('falls back to demo for static hosts, dev servers and failures', async () => {
    expect(await detectDataMode(fetchReturning(() => respond(404, 'Not found', 'text/plain')))).toBe('demo')
    expect(await detectDataMode(fetchReturning(() => respond(200, '<!doctype html>', 'text/html')))).toBe('demo')
    expect(await detectDataMode(fetchReturning(() => respond(200, { data: { mode: 'other' } })))).toBe('demo')
    expect(await detectDataMode(fetchReturning(() => Promise.reject(new TypeError('offline'))))).toBe('demo')
  })

  it('gives up after the timeout', async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError'))))) as unknown as typeof fetch
    expect(await detectDataMode(hanging, 20)).toBe('demo')
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

  it('turns not-found into NotFoundError and other failures into readable errors', async () => {
    const notFound = createHttpContinuumService(fetchReturning(() => respond(404, { error: { code: 'not-found', message: 'Project "x" was not found.' } })))
    await expect(notFound.getWorkspace('x')).rejects.toBeInstanceOf(NotFoundError)
    const broken = createHttpContinuumService(fetchReturning(() => respond(500, { error: { code: 'internal', message: 'Continuum could not read this repository.' } })))
    await expect(broken.getOverview()).rejects.toThrow('Continuum could not read this repository.')
    const garbage = createHttpContinuumService(fetchReturning(() => respond(502, 'Bad gateway', 'text/plain')))
    await expect(garbage.listProjects()).rejects.toBeInstanceOf(ApiError)
  })
})
