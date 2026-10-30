import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from '../io'
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
  })
})

describe('the repository\'s own patterns on every capture path', () => {
  async function storedText(root: string): Promise<string> {
    const { existsSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    return ['', '-wal']
      .map((suffix) => join(root, `.continuum/context.db${suffix}`))
      .filter((path) => existsSync(path))
      .map((path) => readFileSync(path).toString('latin1'))
      .join('')
  }

  it('masks them in what scan and session record', async () => {
    const { writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    repo.commit('initial')
    await cli(repo.root, ['init'])
    writeFileSync(join(repo.root, '.continuum/config.json'), JSON.stringify({ redactPatterns: ['CUST-[0-9]{5}'] }))
    repo.write('a.ts', 'const customer = "CUST-12345"')
    repo.commit('handle CUST-12345')
    expect((await cli(repo.root, ['scan'])).code).toBe(EXIT_OK)
    await cli(repo.root, ['session', 'start', '--agent', 'codex'])
    await cli(repo.root, ['session', 'note', 'Called', 'CUST-54321'])
    await cli(repo.root, ['session', 'end', '--summary', 'Done for CUST-54321'])
    const stored = await storedText(repo.root)
    expect(stored).toContain('handle [redacted]')
    expect(stored).not.toMatch(/CUST-\d/)
  })

  it('refuses to change a setting in a config it cannot read, and leaves the file alone', async () => {
    const { readFileSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    await cli(repo.root, ['init'])
    const path = join(repo.root, '.continuum/config.json')
    const broken = '{ "redactPatterns": ["CUST-[0-9]{5}"], }'
    writeFileSync(path, broken)
    const result = await cli(repo.root, ['config', 'prompts', 'on'])
    expect(result.code).toBe(EXIT_FAILURE)
    expect(result.err).toMatch(/config\.json is not valid/)
    expect(readFileSync(path, 'utf8')).toBe(broken)
  })
})
