import type { Sandbox } from '@continuum/capture/testing'
import { NotFoundError } from '@continuum/core'
import { afterEach, describe, expect, it } from 'vitest'
import { projectIds } from '../ids'
import { LocalContinuumService } from '../localService'
import { detectStack } from '../mapProject'
import { NOW, seededRepo } from './fixtures'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

async function service() {
  const { repo } = await seededRepo()
  sandboxes.push(repo)
  return { repo, service: new LocalContinuumService([{ projectId: 'acme', cwd: repo.root }], { now: () => NOW, ttlMs: 0 }) }
}

describe('LocalContinuumService', () => {
  it('describes the repository as a project from real metadata', async () => {
    const { repo, service: local } = await service()
    const [summary] = await local.listProjects()
    expect(summary.project).toMatchObject({
      id: 'acme',
      repositoryName: repo.root.split('/').at(-1),
      branch: 'main',
      stack: ['Node.js', 'TypeScript'],
      lastActiveAgent: 'claude-code',
      description: `Local repository at ${repo.root}`,
    })
    expect(summary).toMatchObject({ status: 'idle', changedFileCount: 1 })
  })

  it('lists only files changed after the first scan, attributed to the session', async () => {
    const { service: local } = await service()
    const { files } = await local.getWorkspace('acme')
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      path: 'src/auth.ts',
      changeType: 'modified',
      status: 'verified',
      evidenceType: 'verified',
      summary: 'Modified by Claude Code.',
      additions: 0,
      diff: [],
    })
    expect(files[0].relevance).toContain('Covered by passing check unit')
  })

  it('marks a file as needing verification once it changes after the check', async () => {
    const { repo, service: local } = await service()
    repo.write('src/auth.ts', 'auth v3')
    const { files, verification } = await local.getWorkspace('acme')
    expect(verification.find((record) => record.name === 'unit')).toMatchObject({ status: 'out-of-date', detail: expect.stringContaining('src/auth.ts') })
    expect(files.find((file) => file.path === 'src/auth.ts')?.status).toBe('needs-verification')
  })

  it('maps checks, decisions and sessions with their evidence', async () => {
    const { service: local } = await service()
    const { verification, memory, sessions } = await local.getWorkspace('acme')
    expect(verification.map((record) => [record.name, record.status, record.evidenceType])).toEqual([
      ['lint', 'failed', 'verified'],
      ['unit', 'passed', 'verified'],
    ])
    expect(memory).toEqual([
      expect.objectContaining({ title: 'Passwords use argon2', evidenceType: 'agent-reported', relatedFileIds: ['acme~file~src/db.ts'] }),
    ])
    expect(sessions).toEqual([
      expect.objectContaining({ agent: 'claude-code', summary: 'Auth now hashes passwords. Next: rate limiting.', evidenceType: 'agent-reported' }),
    ])
  })

  it('builds an activity feed of real work, newest first, without the baseline import', async () => {
    const { service: local } = await service()
    const activity = await local.listActivity()
    expect(activity.map((event) => event.title)).toEqual([
      'Session ended',
      'Passwords use argon2',
      'lint failed',
      'unit passed',
      'Progress note',
      'Modified src/auth.ts',
      'Claude Code session started',
    ])
    expect(activity.find((event) => event.type === 'test-result')?.evidenceType).toBe('verified')
    expect(activity.find((event) => event.type === 'file-change')).toMatchObject({ agent: 'claude-code', fileId: 'acme~file~src/auth.ts' })
  })

  it('summarizes the overview with attention items for failing and stale evidence', async () => {
    const { repo, service: local } = await service()
    repo.write('src/db.ts', 'db v2')
    const overview = await local.getOverview()
    expect(overview.activeTaskCount).toBe(0)
    expect(overview.recentEvents).toHaveLength(7)
    expect(overview.attention.map((item) => [item.kind, item.title])).toEqual([
      ['awaiting-verification', 'lint is out of date'],
      ['awaiting-verification', 'unit is out of date'],
      ['stale-context', 'Decision may be stale: Passwords use argon2'],
    ])
  })

  it('flags a failing check while its files are unchanged', async () => {
    const { service: local } = await service()
    expect((await local.getOverview()).attention.map((item) => item.title)).toEqual(['lint is failing'])
  })

  it('builds the memory graph from the context graph', async () => {
    const { service: local } = await service()
    const graph = await local.getMemoryGraph('acme')
    const types = graph.nodes.map((node) => node.type).sort()
    expect(types).toEqual(['decision', 'file', 'project', 'session', 'verification', 'verification'])
    expect(graph.edges.map((edge) => edge.label)).toContain('modified')
    expect(graph.edges.every((edge) => graph.nodes.some((node) => node.id === edge.from) && graph.nodes.some((node) => node.id === edge.to))).toBe(true)
  })

  it('renders the same briefing a new agent session receives', async () => {
    const { service: local } = await service()
    const briefing = await local.getBriefing('acme')
    expect(briefing).toContain('# Continuum handoff:')
    expect(briefing).toContain('"Auth now hashes passwords. Next: rate limiting."')
    await expect(local.getBriefing('nope')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('searches projects, changed files and activity', async () => {
    const { service: local } = await service()
    expect((await local.search('auth')).map((result) => result.kind)).toEqual(['file', 'activity'])
    expect(await local.search('   ')).toEqual([])
  })

  it('reports unknown projects as not found and has no tasks yet', async () => {
    const { service: local } = await service()
    await expect(local.getWorkspace('nope')).rejects.toBeInstanceOf(NotFoundError)
    await expect(local.getMemoryGraph('nope')).rejects.toBeInstanceOf(NotFoundError)
    expect(await local.listTasks()).toEqual([])
  })

  it('reuses one read within the cache window', async () => {
    const { repo } = await seededRepo()
    sandboxes.push(repo)
    const cached = new LocalContinuumService([{ projectId: 'acme', cwd: repo.root }], { now: () => NOW, ttlMs: 60_000 })
    const before = (await cached.getWorkspace('acme')).files.length
    repo.write('src/new.ts', 'new')
    expect((await cached.getWorkspace('acme')).files.length).toBe(before)
  })
})

describe('helpers', () => {
  it('derives unique, URL-safe project ids', () => {
    expect(projectIds(['My App', 'my-app', '---', 'Ünïcode'])).toEqual(['my-app', 'my-app-2', 'project', 'n-code'])
  })

  it('detects the stack only from root marker files', () => {
    expect(detectStack(['package.json', 'go.mod', 'web/Cargo.toml', 'vite.config.ts'])).toEqual(['Node.js', 'Go', 'Vite'])
  })
})
