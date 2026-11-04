import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalContinuumService } from '@continuum/daemon'
import { cli, NOW } from './harness'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

describe('continuum handoff with commits', () => {
  it('lists commits made since Continuum started, not the baseline', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    repo.commit('initial import')
    await cli(repo.root, ['init'])
    repo.write('a.ts', 'a2')
    repo.commit('Fix the login redirect')
    await cli(repo.root, ['scan'])
    const { out } = await cli(repo.root, ['handoff'])
    expect(out).toMatch(/Committed \[observed\]: `[0-9a-f]{7}` "Fix the login redirect"/)
    expect(out).not.toContain('initial import')
  })
})

describe('continuum handoff and the dashboard', () => {
  it('prints exactly the briefing the dashboard shows', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    repo.commit('initial import')
    await cli(repo.root, ['init'])
    await cli(repo.root, ['session', 'start', '--agent', 'cursor'])
    await cli(repo.root, ['session', 'note', 'Parser done. Next: add a test for empty names'])
    await cli(repo.root, ['run', '--name', 'unit', '--', process.execPath, '-e', '0'])
    repo.write('a.ts', 'a2')

    const { out } = await cli(repo.root, ['handoff'])
    const briefing = await new LocalContinuumService([{ projectId: 'acme', cwd: repo.root }], { now: () => NOW }).getBriefing('acme')

    expect(briefing).toContain('OUT OF DATE')
    expect(out).toBe(briefing)
  })
})
