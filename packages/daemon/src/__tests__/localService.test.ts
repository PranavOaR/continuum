import type { Sandbox } from '@continuum/capture/testing'
import { NotFoundError } from '@continuum/core'
import { afterEach, describe, expect, it } from 'vitest'
import { projectIds } from '../ids'
import { LocalContinuumService, ProjectUnavailableError } from '../localService'
import { detectStack } from '../mapProject'
import { NOW, openStore, seededRepo } from './fixtures'

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
      diffSource: 'uncommitted',
      additions: 1,
    })
    expect(files[0].diff).toContainEqual({ kind: 'add', text: expect.stringContaining('auth') })
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

describe('LocalContinuumService resilience', () => {
  it('keeps serving the other repositories when one cannot be read', async () => {
    const { repo } = await seededRepo()
    const { repo: doomed } = await seededRepo()
    sandboxes.push(repo, doomed)
    const failures: string[] = []
    const local = new LocalContinuumService(
      [
        { projectId: 'ok', cwd: repo.root },
        { projectId: 'gone', cwd: doomed.root },
      ],
      { now: () => NOW, ttlMs: 0, onError: (projectId) => failures.push(projectId) },
    )
    doomed.cleanup()
    expect((await local.listProjects()).map((summary) => summary.project.id)).toEqual(['ok'])
    await expect(local.getWorkspace('gone')).rejects.toBeInstanceOf(ProjectUnavailableError)
    expect((await local.getWorkspace('ok')).files).toHaveLength(1)
    expect(failures).toContain('gone')
  })

  it('shares one load between concurrent requests', async () => {
    const { repo } = await seededRepo()
    sandboxes.push(repo)
    const local = new LocalContinuumService([{ projectId: 'acme', cwd: repo.root }], { now: () => NOW, ttlMs: 0 })
    const [first, second] = await Promise.all([local.getWorkspace('acme'), local.getWorkspace('acme')])
    expect(first.files).toBe(second.files)
  })

  it('treats files as baseline imports even when a session was recorded before the first scan', async () => {
    const { repo, storePath } = await seededRepo()
    sandboxes.push(repo)
    const store = openStore(storePath)
    const events = [...store.events()].map((event) => store.selfContained(event))
    store.close()
    // Rebuild the log with a session event first, then the original history.
    const { ContextStore } = await import('@continuum/store')
    const rebuilt = ContextStore.open(storePath + '.rebuilt')
    rebuilt.recordAll([
      { type: 'session.started', payload: { sessionId: 'early', agent: 'claude-code' }, evidence: 'observed', source: 'adapter:claude-code', occurredAt: '2026-10-16T10:00:00.000Z' },
      ...events,
    ])
    rebuilt.close()
    const { renameSync } = await import('node:fs')
    renameSync(storePath + '.rebuilt', storePath)
    const local = new LocalContinuumService([{ projectId: 'acme', cwd: repo.root }], { now: () => NOW, ttlMs: 0 })
    expect((await local.getWorkspace('acme')).files.map((file) => file.path)).toEqual(['src/auth.ts'])
  })
})

describe('LocalContinuumService tasks', () => {
  it('maps recorded tasks, makes the current one drive status, and links its files and checks', async () => {
    const { repo, storePath } = await seededRepo()
    sandboxes.push(repo)
    const store = openStore(storePath)
    store.recordAll([
      {
        type: 'task.upserted',
        payload: {
          id: 'oauth',
          title: 'Add Google sign-in',
          status: 'blocked',
          objective: 'Users sign in with Google',
          nextAction: 'Ask for the client secret',
          acceptanceCriteria: [{ text: 'Callback creates a session', met: true }, { text: 'State validated', met: false }],
          completedSteps: ['Callback route'],
          remainingSteps: ['State validation'],
        },
        evidence: 'agent-reported',
        source: 'mcp',
        occurredAt: '2026-10-16T11:40:00.000Z',
      },
      { type: 'file.changed', payload: { path: 'src/auth.ts', contentHash: repo.git('hash-object', 'src/auth.ts'), changeType: 'modified', taskId: 'oauth' }, evidence: 'observed', source: 'adapter:claude-code', occurredAt: '2026-10-16T11:41:00.000Z' },
    ])
    store.close()
    const local = new LocalContinuumService([{ projectId: 'acme', cwd: repo.root }], { now: () => NOW, ttlMs: 0 })

    const workspace = await local.getWorkspace('acme')
    expect(workspace.project.currentTaskId).toBe('oauth')
    expect(workspace.tasks).toEqual([
      expect.objectContaining({
        id: 'oauth',
        status: 'blocked',
        nextAction: 'Ask for the client secret',
        relatedFileIds: ['acme~file~src/auth.ts'],
        verificationIds: expect.arrayContaining(['acme~check~unit', 'acme~check~lint']),
        acceptanceCriteria: [
          expect.objectContaining({ status: 'complete', evidence: expect.stringContaining('not verified') }),
          expect.objectContaining({ status: 'incomplete' }),
        ],
      }),
    ])
    expect(workspace.events.find((event) => event.type === 'task-update')).toMatchObject({ taskId: 'oauth', description: 'Task is blocked. Next: Ask for the client secret' })

    const [summary] = await local.listProjects()
    expect(summary).toMatchObject({ status: 'blocked', progress: { done: 1, total: 2 }, currentTask: { id: 'oauth' } })
    const overview = await local.getOverview()
    expect(overview.activeTaskCount).toBe(1)
    expect(overview.attention[0]).toMatchObject({ kind: 'incomplete-task', title: 'Blocked: Add Google sign-in' })
    expect((await local.search('google')).map((result) => result.kind)).toEqual(['task', 'activity'])
    expect(await local.listTasks()).toHaveLength(1)
  })
})

describe('LocalContinuumService task edits', () => {
  async function withTask() {
    const { repo, storePath } = await seededRepo()
    sandboxes.push(repo)
    const store = openStore(storePath)
    store.record({
      type: 'task.upserted',
      payload: { id: 'auth-1', title: 'Auth', status: 'in-progress', nextAction: 'Write tests', acceptanceCriteria: [{ text: 'Logs in', met: false }], completedSteps: ['Plan'], remainingSteps: ['Build', 'Test'] },
      evidence: 'agent-reported',
      source: 'mcp',
      occurredAt: NOW.toISOString(),
    })
    store.close()
    return { storePath, local: new LocalContinuumService([{ projectId: 'acme', cwd: repo.root }], { now: () => NOW, ttlMs: 60_000 }) }
  }

  it('records each edit as yours and shows it straight away', async () => {
    const { storePath, local } = await withTask()
    await local.getWorkspace('acme') // warm the cache: the edit must not be hidden behind it
    expect(await local.updateTask('acme', 'auth-1', { kind: 'step', step: 'Build', done: true })).toMatchObject({ completedSteps: ['Plan', 'Build'], remainingSteps: ['Test'], reportedBy: 'user-reported' })
    await local.updateTask('acme', 'auth-1', { kind: 'criterion', index: 0, met: true })
    await local.updateTask('acme', 'auth-1', { kind: 'next-action', nextAction: 'Ship it' })
    const task = await local.updateTask('acme', 'auth-1', { kind: 'status', status: 'blocked' })
    expect(task).toMatchObject({ status: 'blocked', nextAction: 'Ship it', acceptanceCriteria: [{ status: 'complete', evidence: 'Set by you in the dashboard; not verified.' }] })

    const store = openStore(storePath)
    const last = store.recentEvents(1)[0].event
    store.close()
    expect(last).toMatchObject({ type: 'task.upserted', evidence: 'user-reported', source: 'dashboard' })
    expect(await local.getBriefing('acme')).toContain('[set by you] "Auth" (blocked)')
  })

  it('rejects edits to steps or tasks that do not exist', async () => {
    const { local } = await withTask()
    await expect(local.updateTask('acme', 'auth-1', { kind: 'step', step: 'Invented', done: true })).rejects.toThrow(/not a step/)
    await expect(local.updateTask('acme', 'nope', { kind: 'status', status: 'completed' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(local.updateTask('elsewhere', 'auth-1', { kind: 'status', status: 'completed' })).rejects.toBeInstanceOf(NotFoundError)
  })
})
