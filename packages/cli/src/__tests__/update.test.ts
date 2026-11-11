import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setupClaudeCode, setupCodex } from '@continuum/claude-code'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_OK, EXIT_USAGE } from '../io'
import { cli } from './harness'

const OLD = { command: 'npx', args: ['-y', 'getcontinuum@0.4.0'], portable: true }
const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

function sandbox() {
  const repo = createSandbox({ 'a.ts': 'a' })
  sandboxes.push(repo)
  return repo
}

const settings = (root: string) => readFileSync(join(root, '.claude/settings.local.json'), 'utf8')
const codexHooks = (root: string) => readFileSync(join(root, '.codex/hooks.json'), 'utf8')

/** A repository set up with an older release, as a user who ran setup on 0.4.0 has. */
async function onOldRelease() {
  const repo = sandbox()
  await cli(repo.root, ['init'])
  await setupClaudeCode(repo.root, OLD)
  await setupCodex(repo.root, OLD)
  return repo
}

describe('continuum update', () => {
  it('points every agent setup connected here at the running version, and records the rewritten files', async () => {
    const repo = await onOldRelease()
    expect(settings(repo.root)).toContain('getcontinuum@0.4.0')
    const result = await cli(repo.root, ['update'])
    expect(result.code).toBe(EXIT_OK)
    expect(result.out).toContain(`${repo.root}: Claude Code, Codex now run this copy of Continuum.`)
    expect(settings(repo.root)).not.toContain('getcontinuum@0.4.0')
    expect(codexHooks(repo.root)).not.toContain('getcontinuum@0.4.0')
    expect((await cli(repo.root, ['status'])).out).toContain('all recorded')
  })

  it('updates every connected repository with --all', async () => {
    const first = await onOldRelease()
    const second = await onOldRelease()
    // setup registers a repository for serve and update; these were set up directly, so register them the same way.
    await cli(first.root, ['setup', 'cursor'])
    await cli(second.root, ['setup', 'cursor'])
    await setupClaudeCode(first.root, OLD)
    await setupClaudeCode(second.root, OLD)
    const result = await cli(first.root, ['update', '--all'])
    expect(result.out).toContain(first.root)
    expect(result.out).toContain(second.root)
    expect(settings(first.root)).not.toContain('getcontinuum@0.4.0')
    expect(settings(second.root)).not.toContain('getcontinuum@0.4.0')
  })

  it('says so when no agent was connected by setup, and refuses unknown options', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    expect((await cli(repo.root, ['update'])).out).toContain('nothing to update')
    expect((await cli(repo.root, ['update', '--everything'])).code).toBe(EXIT_USAGE)
  })
})

describe('the update notice after a command', () => {
  it('is shown on stderr after the output, and not for the commands agents run', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const asked: string[] = []
    const updateCheck = (command: string) => {
      asked.push(command)
      return { finish: async () => 'Update available: Continuum 0.5.0 → 0.6.0. Run: npx getcontinuum@latest update' }
    }
    const status = await cli(repo.root, ['status'], { updateCheck })
    expect(status.err).toBe('Update available: Continuum 0.5.0 → 0.6.0. Run: npx getcontinuum@latest update')
    expect(status.out).toContain('Workspace')
    expect(asked).toEqual(['status'])
  })

  it('can be turned off and on as your setting, outside any repository', async () => {
    const outside = sandbox().root
    expect((await cli(outside, ['config', 'update-check', 'off'])).out).toBe('update-check is now off for every repository on this machine.')
    expect((await cli(outside, ['config', 'update-check', 'maybe'])).code).toBe(EXIT_USAGE)
    await cli(outside, ['init'])
    expect((await cli(outside, ['config'])).out).toMatch(/update-check\s+off/)
    await cli(outside, ['config', 'update-check', 'on'])
    expect((await cli(outside, ['config'])).out).toMatch(/update-check\s+on /)
  })
})

describe('the command table after setup', () => {
  it('ends setup with the bordered table of commands, then the dashboard line, as setup has always ended', async () => {
    const repo = sandbox()
    const { out } = await cli(repo.root, ['setup', 'claude-code'])
    expect(out).toContain('Run any of them as continuum <command>:')
    expect(out).toMatch(/│ search <words>\s+│ Find decisions, issues, tasks and notes by their words\s+│/)
    expect(out).toContain('continuum --help lists every option.')
    expect(out.trimEnd().split('\n').at(-1)).toBe('See what Continuum records: continuum serve')
  })

  it('fits the terminal it is shown in, coloured where the terminal shows colour', async () => {
    const repo = sandbox()
    const { out } = await cli(repo.root, ['setup', 'claude-code'], { terminal: { columns: 80, hasColour: true } })
    expect(out).toContain('\x1b[38;5;105m┌')
    // oxlint-disable-next-line no-control-regex -- the escapes are what is being removed
    const top = out.split('\n').map((line) => line.replace(/\x1b\[[0-9;]*m/g, '')).find((line) => line.startsWith('┌'))
    expect([...(top ?? '')].length).toBe(80)
  })
})
