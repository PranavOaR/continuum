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

  it('turns not-found into NotFoundError and other failures into readable errors', async () => {
    const notFound = createHttpContinuumService(fetchReturning(() => respond(404, { error: { code: 'not-found', message: 'Project "x" was not found.' } })))
    await expect(notFound.getWorkspace('x')).rejects.toBeInstanceOf(NotFoundError)
    const broken = createHttpContinuumService(fetchReturning(() => respond(500, { error: { code: 'internal', message: 'Continuum could not read this repository.' } })))
    await expect(broken.getOverview()).rejects.toThrow('Continuum could not read this repository.')
    const garbage = createHttpContinuumService(fetchReturning(() => respond(502, 'Bad gateway', 'text/plain')))
    await expect(garbage.listProjects()).rejects.toBeInstanceOf(ApiError)
  })
})
