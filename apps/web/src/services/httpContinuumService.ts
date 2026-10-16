import { NotFoundError, type ContinuumService } from '@continuum/core'

type Fetch = typeof fetch

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

/** Reads the local daemon's API. Same contract as the mock service, so screens do not change. */
export function createHttpContinuumService(fetchImpl: Fetch = fetch, base = ''): ContinuumService {
  async function get<T>(path: string): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, { headers: { Accept: 'application/json' } })
    let body: Envelope<T>
    try {
      body = (await response.json()) as Envelope<T>
    } catch {
      throw new ApiError(response.status, `The local Continuum server sent an unreadable response (${response.status}).`)
    }
    if (response.status === 404 && body.error?.code === 'not-found') throw new NotFoundError('Resource', path)
    if (!response.ok || body.data === undefined) throw new ApiError(response.status, body.error?.message ?? `Request failed (${response.status}).`)
    return body.data
  }
  const project = (id: string) => `/api/projects/${encodeURIComponent(id)}`
  return {
    getOverview: () => get('/api/overview'),
    listProjects: () => get('/api/projects'),
    listTasks: () => get('/api/tasks'),
    getWorkspace: (projectId) => get(`${project(projectId)}/workspace`),
    listActivity: () => get('/api/activity'),
    getMemoryGraph: (projectId) => get(`${project(projectId)}/graph`),
    search: (query) => get(`/api/search?q=${encodeURIComponent(query)}`),
    getBriefing: (projectId) => get(`${project(projectId)}/briefing`),
  }
}
