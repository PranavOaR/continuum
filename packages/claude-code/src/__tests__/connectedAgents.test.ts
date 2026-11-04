import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { removeCodexSetup, setupCodex } from '../codexSetup'
import { connectedAgents, connectedHookAgents } from '../connectedAgents'
import { removeCursorSetup, setupCursor } from '../cursorSetup'
import { PLUGIN_ID } from '../pluginStatus'
import { setupClaudeCode } from '../setup'
import { setupVsCode } from '../vscodeSetup'

const NPX = { command: 'npx', args: ['-y', 'getcontinuum@0.3.0'], portable: true }
const sandboxes: Sandbox[] = []
const dirs: string[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function repo(): string {
  const created = createSandbox({ 'a.ts': 'a' })
  sandboxes.push(created)
  return created.root
}

/** A Claude Code config directory of its own, so the developer's real settings never leak in. */
function claudeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-connected-'))
  dirs.push(dir)
  return dir
}

describe('connectedAgents', () => {
  it('is empty before any agent is connected', async () => {
    expect(await connectedAgents(repo(), claudeDir())).toEqual([])
  })

  it('finds Claude Code from its hooks', async () => {
    const root = repo()
    await setupClaudeCode(root, NPX)
    expect(await connectedAgents(root, claudeDir())).toEqual(['claude-code'])
  })

  it('finds Claude Code from the plugin, which keeps its hooks outside the repository', async () => {
    const claude = claudeDir()
    writeFileSync(join(claude, 'settings.json'), JSON.stringify({ enabledPlugins: { [PLUGIN_ID]: true } }))
    expect(await connectedAgents(repo(), claude)).toEqual(['claude-code'])
  })

  it('finds Codex alone', async () => {
    const root = repo()
    await setupCodex(root, NPX)
    expect(await connectedAgents(root, claudeDir())).toEqual(['codex'])
  })

  it('finds VS Code alone', async () => {
    const root = repo()
    await setupVsCode(root, NPX)
    expect(await connectedAgents(root, claudeDir())).toEqual(['vscode'])
  })

  it('finds Cursor alone', async () => {
    const root = repo()
    await setupCursor(root, NPX)
    expect(await connectedAgents(root, claudeDir())).toEqual(['cursor'])
  })

  it('lists every connected agent in a stable order', async () => {
    const root = repo()
    await setupCursor(root, NPX)
    await setupCodex(root, NPX)
    await setupClaudeCode(root, NPX)
    expect(await connectedAgents(root, claudeDir())).toEqual(['claude-code', 'codex', 'cursor'])
  })

  it('stops listing an agent once it is removed', async () => {
    const root = repo()
    await setupCodex(root, NPX)
    await setupCursor(root, NPX)
    await removeCodexSetup(root)
    await removeCursorSetup(root)
    expect(await connectedAgents(root, claudeDir())).toEqual([])
  })

  it('does not take a rule you wrote for Continuum being connected', async () => {
    const root = repo()
    mkdirSync(join(root, '.cursor/rules'), { recursive: true })
    writeFileSync(join(root, '.cursor/rules/continuum.mdc'), '# my own notes\n')
    expect(await connectedAgents(root, claudeDir())).toEqual([])
  })

  it('treats a settings file it cannot read as not connected', async () => {
    const root = repo()
    mkdirSync(join(root, '.claude'), { recursive: true })
    writeFileSync(join(root, '.claude/settings.local.json'), '{ not json')
    expect(await connectedAgents(root, claudeDir())).toEqual([])
  })
})

describe('connectedHookAgents', () => {
  it('leaves out agents without hooks', async () => {
    const root = repo()
    await setupCursor(root, NPX)
    await setupCodex(root, NPX)
    expect([...(await connectedHookAgents(root))]).toEqual(['codex'])
  })
})
