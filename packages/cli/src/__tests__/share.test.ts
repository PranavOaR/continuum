import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openWorkspace, SHARED_FILE } from '@continuum/capture'
import { createSandbox, removeTemporary, type Sandbox } from '@continuum/capture/testing'
import { hashContent } from '@continuum/store'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from '../io'
import { cli, NOW } from './harness'

const GIT_IDENTITY = ['-c', 'user.name=Continuum Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false']
const TAX = 'exports.addTax = (cents, rate) => cents + Math.round(cents * rate)\n'
const ROUNDING = '6c1f2a90-0000-4000-8000-000000000001'
const FLAKY = '9e8d7c6b-0000-4000-8000-000000000002'

const sandboxes: Sandbox[] = []
const folders: string[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
  for (const folder of folders.splice(0)) removeTemporary(folder)
})

/** A repository with a decision anchored to src/tax.js and a known issue, both recorded by an agent. */
async function repoWithDecisions() {
  const repo = createSandbox({ 'src/tax.js': TAX, 'README.md': 'r' })
  sandboxes.push(repo)
  repo.commit('start')
  await cli(repo.root, ['init'])
  const { store } = await openWorkspace(repo.root)
  const at = new Date(NOW.getTime() - 3_600_000).toISOString()
  store.recordAll([
    { type: 'task.upserted', payload: { id: 'tax', title: 'Round tax', status: 'completed' }, evidence: 'agent-reported', source: 'mcp', occurredAt: at },
    {
      type: 'memory.recorded',
      payload: { id: ROUNDING, kind: 'decision', title: 'Tax rounds to the cent', body: 'Math.round, never truncate.', taskId: 'tax', anchors: { 'file:src/tax.js': hashContent(TAX) } },
      evidence: 'agent-reported',
      source: 'mcp',
      occurredAt: at,
    },
    { type: 'memory.recorded', payload: { id: FLAKY, kind: 'known-issue', title: 'The login test is flaky on CI', body: '', anchors: {} }, evidence: 'user-reported', source: 'dashboard', occurredAt: at },
  ])
  store.close()
  return repo
}

const sharedFile = (root: string) => JSON.parse(readFileSync(join(root, SHARED_FILE), 'utf8')) as { version: number; records: { id: string; title: string; taskId?: string }[] }

describe('continuum share', () => {
  it('lists what can be shared, with a short id to share it by', async () => {
    const repo = await repoWithDecisions()
    const result = await cli(repo.root, ['share'])
    expect(result.code).toBe(EXIT_OK)
    expect(result.out).toContain('6c1f2a90  local   Decision: Tax rounds to the cent')
    expect(result.out).toContain('9e8d7c6b  local   Known issue: The login test is flaky on CI')
    expect(result.out).toContain('continuum share <id>')
    expect(existsSync(join(repo.root, SHARED_FILE))).toBe(false)
  })

  it('writes the record to the shared file, without its local task, and says to commit it', async () => {
    const repo = await repoWithDecisions()
    const result = await cli(repo.root, ['share', '6c1f'])
    expect(result.code).toBe(EXIT_OK)
    expect(result.out).toContain(`Shared 1 record in ${SHARED_FILE}`)
    expect(result.out).toContain('Commit it')
    const file = sharedFile(repo.root)
    expect(file.version).toBe(1)
    expect(file.records.map((shared) => shared.id)).toEqual([ROUNDING])
    expect(file.records[0]).not.toHaveProperty('taskId')
    expect((await cli(repo.root, ['share'])).out).toContain('6c1f2a90  shared  Decision: Tax rounds to the cent')
  })

  it('shares everything with --all, and takes a record back out with --remove', async () => {
    const repo = await repoWithDecisions()
    expect((await cli(repo.root, ['share', '--all'])).out).toContain(`Shared 2 records in ${SHARED_FILE}`)
    expect(sharedFile(repo.root).records).toHaveLength(2)
    const removed = await cli(repo.root, ['share', '--remove', '9e8d'])
    expect(removed.code).toBe(EXIT_OK)
    expect(removed.out).toContain(`Removed 1 record from ${SHARED_FILE}`)
    expect(sharedFile(repo.root).records.map((shared) => shared.id)).toEqual([ROUNDING])
  })

  it('refuses an id it cannot find, or one that matches two records', async () => {
    const repo = await repoWithDecisions()
    const unknown = await cli(repo.root, ['share', 'zzzz'])
    expect(unknown.code).toBe(EXIT_USAGE)
    expect(unknown.err).toContain('No decision or note starts with "zzzz"')
    const ambiguous = await cli(repo.root, ['share', ''])
    expect(ambiguous.code).toBe(EXIT_USAGE)
  })

  it('says so when asked to remove a record the file does not have', async () => {
    const repo = await repoWithDecisions()
    await cli(repo.root, ['share', '6c1f'])
    const result = await cli(repo.root, ['share', '--remove', '9e8d'])
    expect(result.code).toBe(EXIT_USAGE)
    expect(result.err).toContain(`${SHARED_FILE} has no record starting with "9e8d"`)
  })

  it('stops with a readable reason when the shared file is broken, and leaves it as it is', async () => {
    const repo = await repoWithDecisions()
    repo.write(SHARED_FILE, '{ broken')
    const result = await cli(repo.root, ['share', '6c1f'])
    expect(result.code).toBe(EXIT_FAILURE)
    expect(result.err).toContain(`${SHARED_FILE} is not valid JSON`)
    expect(readFileSync(join(repo.root, SHARED_FILE), 'utf8')).toBe('{ broken')
  })

  it('says when a scan takes shared decisions, or skips a broken file', async () => {
    const repo = await repoWithDecisions()
    const record = { id: 'team-1', kind: 'decision', title: 'Prices are in cents', body: '', anchors: {}, evidence: 'agent-reported', recordedAt: NOW.toISOString() }
    repo.write(SHARED_FILE, JSON.stringify({ version: 1, records: [record, { ...record, id: 'bad id' }] }))
    const scanned = await cli(repo.root, ['scan'])
    expect(scanned.code).toBe(EXIT_OK)
    expect(scanned.out).toContain(`Took 1 shared decision from ${SHARED_FILE}.`)
    expect(scanned.err).toContain(`skipped 1 record in ${SHARED_FILE}`)
    repo.write(SHARED_FILE, '{ broken')
    expect((await cli(repo.root, ['scan'])).err).toContain('is not valid JSON')
  })

  it('reaches a teammate’s next briefing through git', async () => {
    const repo = await repoWithDecisions()
    await cli(repo.root, ['share', '6c1f'])
    repo.commit('share the rounding decision')

    // A teammate's clone: its own store, nothing recorded but what git carries.
    const parent = realpathSync.native(mkdtempSync(join(tmpdir(), 'continuum-teammate-')))
    folders.push(parent)
    const teammate = join(parent, 'checkout')
    execFileSync('git', [...GIT_IDENTITY, 'clone', '--quiet', repo.root, teammate])
    await cli(teammate, ['init'])

    const briefing = await cli(teammate, ['handoff'])
    expect(briefing.out).toContain('- [agent-reported] Decision: Tax rounds to the cent. Math.round, never truncate. (shared in the repository)')
    expect(briefing.out).not.toContain('flaky')
  })
})
