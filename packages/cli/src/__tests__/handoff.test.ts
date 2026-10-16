import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { cli } from './harness'

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
