import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openWorkspace } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { hashContent } from '@continuum/store'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from '../io'
import { cli, NOW } from './harness'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

const SESSION = 'export const createSession = () => 1\n'

/** A repository with a finished billing task that left a decision anchored to src/session.ts. */
async function repoWithMemory() {
  const repo = createSandbox({ 'src/session.ts': SESSION, 'README.md': 'r' })
  sandboxes.push(repo)
  await cli(repo.root, ['init'])
  const { store } = await openWorkspace(repo.root)
  const at = new Date(NOW.getTime() - 3_600_000).toISOString()
  store.recordAll([
    { type: 'task.upserted', payload: { id: 'billing', title: 'Invoice export', status: 'completed' }, evidence: 'agent-reported', source: 'mcp', occurredAt: at },
    { type: 'memory.recorded', payload: { id: 'idem', kind: 'decision', title: 'Retries are safe for ACME-123456', body: 'Handlers check the idempotency key.', taskId: 'billing', anchors: { 'file:src/session.ts': hashContent(SESSION) } }, evidence: 'agent-reported', source: 'mcp', occurredAt: at },
  ])
  store.close()
  return repo
}

describe('continuum search', () => {
  it('finds an old decision on another task by a word in its body', async () => {
    const repo = await repoWithMemory()
    const result = await cli(repo.root, ['search', 'idempotency'])
    expect(result.code).toBe(EXIT_OK)
    expect(result.out).toContain('1 record matches "idempotency"')
    expect(result.out).toContain('[agent-reported] decision: Retries are safe')
    expect(result.out).toContain('task "Invoice export"')
    expect(result.out).toContain('anchored to src/session.ts')
  })

  it('takes several words and a limit, and says when nothing matches', async () => {
    const repo = await repoWithMemory()
    expect((await cli(repo.root, ['search', '--limit', '1', 'invoice', 'retries'])).out).toContain('1 record matches "invoice retries"')
    expect((await cli(repo.root, ['search', 'kubernetes'])).out).toContain('Nothing recorded matches "kubernetes"')
  })

  it("masks results with the repository's redaction patterns as they are now", async () => {
    const repo = await repoWithMemory()
    writeFileSync(join(repo.root, '.continuum', 'config.json'), JSON.stringify({ redactPatterns: ['ACME-[0-9]{6}'] }))
    const result = await cli(repo.root, ['search', 'retries'])
    expect(result.out).toContain('Retries are safe for [redacted]')
    expect(result.out).not.toContain('ACME-123456')
  })

  it('refuses a search with no words or a bad option', async () => {
    const repo = await repoWithMemory()
    expect((await cli(repo.root, ['search'])).code).toBe(EXIT_USAGE)
    expect((await cli(repo.root, ['search', '--limit', '0', 'x'])).code).toBe(EXIT_USAGE)
    expect((await cli(repo.root, ['search', '--bogus', 'x'])).code).toBe(EXIT_USAGE)
  })
})

describe('continuum why', () => {
  it('lists every record anchored to a file, each with its evidence label', async () => {
    const repo = await repoWithMemory()
    const result = await cli(repo.root, ['why', 'src/session.ts'])
    expect(result.code).toBe(EXIT_OK)
    expect(result.out).toContain('What is recorded about src/session.ts: 1 decision')
    expect(result.out).toContain('- [agent-reported] decision: Retries are safe')
  })

  it('accepts a symbol, and a path relative to the folder it ran in', async () => {
    const repo = await repoWithMemory()
    expect((await cli(repo.root, ['why', 'src/session.ts#createSession'])).out).toContain('What is recorded about src/session.ts#createSession: 1 decision')
    expect((await cli(join(repo.root, 'src'), ['why', 'session.ts'])).out).toContain('What is recorded about src/session.ts')
  })

  it('says when nothing is recorded, shows nothing for an ignored file, and refuses paths outside the repository', async () => {
    const repo = await repoWithMemory()
    expect((await cli(repo.root, ['why', 'README.md'])).out).toContain('Nothing recorded is linked to README.md yet')
    expect((await cli(repo.root, ['why', 'nope.ts'])).out).toContain('Continuum has no record of nope.ts')
    expect((await cli(repo.root, ['why', '../elsewhere.ts'])).code).toBe(EXIT_FAILURE)
    mkdirSync(join(repo.root, 'src'), { recursive: true })
    writeFileSync(join(repo.root, '.continuumignore'), 'src/session.ts\n')
    const ignored = await cli(repo.root, ['why', 'src/session.ts'])
    expect(ignored.out).toContain('listed in .continuumignore')
    expect(ignored.out).not.toContain('Retries are safe')
  })

  it('needs exactly one target', async () => {
    const repo = await repoWithMemory()
    expect((await cli(repo.root, ['why'])).code).toBe(EXIT_USAGE)
    expect((await cli(repo.root, ['why', 'a', 'b'])).code).toBe(EXIT_USAGE)
  })
})
