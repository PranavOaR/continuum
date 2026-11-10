import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from '../io'
import { cli } from './harness'

const sandboxes: Sandbox[] = []
const dirs: string[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A per-user folder of its own, so tests never share a profile. */
function configDir() {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-profile-cli-'))
  dirs.push(dir)
  return dir
}

function sandbox() {
  const repo = createSandbox({ 'a.ts': 'a' })
  sandboxes.push(repo)
  return repo
}

const hook = (repo: Sandbox, fields: Record<string, unknown>) => JSON.stringify({ session_id: 's1', cwd: repo.root, transcript_path: '/t.jsonl', ...fields })

describe('continuum profile', () => {
  it('adds, lists and removes preferences, outside any repository', async () => {
    const config = configDir()
    const outside = configDir()
    expect((await cli(outside, ['profile'], { configDir: config })).out).toContain('No preferences yet')
    expect((await cli(outside, ['profile', 'add', 'Use pnpm,', 'never npm'], { configDir: config })).out).toContain('1. Use pnpm, never npm')
    await cli(outside, ['profile', 'add', 'Ask before pushing'], { configDir: config })
    const removed = await cli(outside, ['profile', 'remove', '1'], { configDir: config })
    expect(removed.code).toBe(EXIT_OK)
    expect(removed.out).toContain('1. Ask before pushing')
    expect(removed.out).not.toContain('pnpm')
  })

  it('refuses a number that is not listed, and anything else', async () => {
    const config = configDir()
    expect((await cli(config, ['profile', 'remove', '3'], { configDir: config })).code).toBe(EXIT_FAILURE)
    expect((await cli(config, ['profile', 'add'], { configDir: config })).code).toBe(EXIT_USAGE)
    expect((await cli(config, ['profile', 'clear'], { configDir: config })).code).toBe(EXIT_USAGE)
  })

  it('names the file when the profile cannot be read, and doctor warns about it', async () => {
    const config = configDir()
    writeFileSync(join(config, 'profile.json'), 'not json')
    const result = await cli(config, ['profile'], { configDir: config })
    expect(result.code).toBe(EXIT_FAILURE)
    expect(result.err).toMatch(/Cannot read .*profile\.json/)
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'], { configDir: config })
    expect((await cli(repo.root, ['doctor'], { configDir: config })).out).toContain('! Your profile cannot be read, so briefings leave your preferences out')
  })
})

describe('your preferences in briefings', () => {
  it("reach a new repository's first session, though nothing is recorded there yet", async () => {
    const config = configDir()
    await cli(config, ['profile', 'add', 'Use pnpm, never npm'], { configDir: config })
    const repo = sandbox()
    await cli(repo.root, ['init'], { configDir: config })
    const started = await cli(repo.root, ['ingest'], { configDir: config, readStdin: async () => hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }) })
    const context = JSON.parse(started.out).hookSpecificOutput.additionalContext as string
    expect(context).toContain('## Your preferences')
    expect(context).toContain('- "Use pnpm, never npm"')
    expect(context).toContain('The one exception is "Your preferences"')
  })

  it('stay out of a first session when you have none, as before', async () => {
    const config = configDir()
    const repo = sandbox()
    await cli(repo.root, ['init'], { configDir: config })
    expect((await cli(repo.root, ['ingest'], { configDir: config, readStdin: async () => hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }) })).out).toBe('')
  })

  it("are in `continuum handoff`, masked by the repository's own redaction patterns", async () => {
    const config = configDir()
    await cli(config, ['profile', 'add', 'Customer ACME-123456 reviews releases'], { configDir: config })
    const repo = sandbox()
    await cli(repo.root, ['init'], { configDir: config })
    writeFileSync(join(repo.root, '.continuum', 'config.json'), JSON.stringify({ redactPatterns: ['ACME-[0-9]{6}'] }))
    const handoff = (await cli(repo.root, ['handoff'], { configDir: config })).out
    expect(handoff).toContain('- "Customer [redacted] reviews releases"')
    expect(handoff).not.toContain('ACME-123456')
  })
})
