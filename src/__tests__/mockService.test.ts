import { describe, expect, it } from 'vitest'
import { mockContinuumService as service } from '../services/mockContinuumService'
import { NotFoundError } from '../services/types'

describe('mock continuum service', () => {
  it('returns coherent overview numbers', async () => {
    const overview = await service.getOverview()
    expect(overview.projects).toHaveLength(4)
    expect(overview.activeTaskCount).toBe(5)
    expect(overview.changedFileCount).toBe(12)
    expect(overview.recentEvents[0].title).toBe('Session ended before full verification')
  })

  it('flags incomplete work, pending verification and stale context', async () => {
    const { attention } = await service.getOverview()
    const kinds = new Set(attention.map((item) => item.kind))
    expect(kinds).toEqual(new Set(['incomplete-task', 'awaiting-verification', 'stale-context']))
    expect(attention.find((item) => item.kind === 'stale-context')?.projectId).toBe('analytics-platform')
  })

  it('derives project status from the current task', async () => {
    const projects = await service.listProjects()
    const status = Object.fromEntries(projects.map((p) => [p.project.id, p.status]))
    expect(status).toEqual({ 'startup-app': 'in-progress', 'dev-portfolio': 'in-progress', 'analytics-platform': 'blocked', 'docs-site': 'idle' })
  })

  it('rejects unknown projects with NotFoundError', async () => {
    await expect(service.getWorkspace('nope')).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.getMemoryGraph('nope')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('searches projects, tasks, files and activity', async () => {
    const results = await service.search('google')
    const kinds = new Set(results.map((r) => r.kind))
    expect(kinds.has('task')).toBe(true)
    expect(kinds.has('file')).toBe(true)
    expect(kinds.has('activity')).toBe(true)
    expect(await service.search('')).toEqual([])
    expect(await service.search('zzz-no-match')).toEqual([])
  })

  it('builds a memory graph whose edges reference existing nodes', async () => {
    const graph = await service.getMemoryGraph('startup-app')
    const nodeIds = new Set(graph.nodes.map((n) => n.id))
    expect(graph.edges.length).toBeGreaterThan(10)
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.from) && nodeIds.has(edge.to)).toBe(true)
    }
    expect(graph.nodes.some((n) => n.type === 'symbol' && n.label === 'createSessionFromOAuth')).toBe(true)
    expect(graph.nodes.some((n) => n.type === 'decision')).toBe(true)
  })

  it('returns activity newest first and tasks for every project', async () => {
    const activity = await service.listActivity()
    const times = activity.map((e) => Date.parse(e.timestamp))
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect((await service.listTasks()).length).toBe(8)
  })
})
