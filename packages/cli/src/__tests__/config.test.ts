import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_OK, EXIT_USAGE } from '../io'
import { cli } from './harness'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

describe('continuum config', () => {
  it('lists the defaults and changes a setting', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    await cli(repo.root, ['init'])
    expect((await cli(repo.root, ['config'])).out).toMatch(/agent-checks\s+on[\s\S]*prompts\s+off/)
    expect((await cli(repo.root, ['config', 'agent-checks', 'off'])).code).toBe(EXIT_OK)
    expect((await cli(repo.root, ['config'])).out).toMatch(/agent-checks\s+off/)
  })

  it('rejects unknown settings and values', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    await cli(repo.root, ['init'])
    expect((await cli(repo.root, ['config', 'telemetry', 'on'])).code).toBe(EXIT_USAGE)
    expect((await cli(repo.root, ['config', 'prompts', 'maybe'])).code).toBe(EXIT_USAGE)
  })
})

describe('redaction settings', () => {
  it('masks custom patterns from the config and says how many secrets it masked', async () => {
    const { writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    await cli(repo.root, ['init'])
    writeFileSync(join(repo.root, '.continuum/config.json'), JSON.stringify({ redactPatterns: ['CUST-[0-9]{5}'] }))
    const result = await cli(repo.root, ['run', '--', process.execPath, '-e', 'console.log("customer CUST-12345 ok")'])
    // Once in the command line, once in its output.
    expect(result.err).toContain('masked 2 secrets')
    expect(result.err).toContain('console.log("customer [redacted] ok")')
    const { setCustomRedactions } = await import('@continuum/capture')
    setCustomRedactions([])
  })
})
