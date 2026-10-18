import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_OK, EXIT_USAGE } from '../io'
import { cli, NOW } from './harness'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

const DAY_MS = 86_400_000

describe('continuum compact', () => {
  it('folds old events into a checkpoint and keeps status unchanged', async () => {
    const repo = createSandbox({ 'a.ts': 'a', 'b.ts': 'b' })
    sandboxes.push(repo)
    const longAgo = new Date(NOW.getTime() - 60 * DAY_MS)
    await cli(repo.root, ['init'], { now: () => longAgo })
    repo.write('a.ts', 'a2')
    await cli(repo.root, ['scan'], { now: () => longAgo })
    const statusBefore = (await cli(repo.root, ['status'])).out

    const result = await cli(repo.root, ['compact'])
    expect(result.code).toBe(EXIT_OK)
    expect(result.out).toMatch(/Folded \d+ events from before/)
    expect((await cli(repo.root, ['status'])).out.replace(/· \d+ events?/, '')).toBe(statusBefore.replace(/· \d+ events?/, ''))
    expect((await cli(repo.root, ['compact'])).out).toContain('Nothing to compact')
  })

  it('rejects a malformed window', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    await cli(repo.root, ['init'])
    expect((await cli(repo.root, ['compact', '--keep-days', 'soon'])).code).toBe(EXIT_USAGE)
  })
})
