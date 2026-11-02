import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultClaudeConfigDir, isContinuumPluginEnabled, PLUGIN_ID } from '../pluginStatus'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temporaryDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-plugin-status-'))
  dirs.push(dir)
  return dir
}

function writeSettings(path: string, enabledPlugins: Record<string, unknown>): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify({ enabledPlugins }))
}

describe('isContinuumPluginEnabled', () => {
  it('is false when no settings enable the plugin', async () => {
    expect(await isContinuumPluginEnabled(temporaryDir(), temporaryDir())).toBe(false)
  })

  it('is true when the user settings enable it', async () => {
    const claudeDir = temporaryDir()
    writeSettings(join(claudeDir, 'settings.json'), { [PLUGIN_ID]: true, 'other@market': true })
    expect(await isContinuumPluginEnabled(temporaryDir(), claudeDir)).toBe(true)
  })

  it('is true when the project settings enable it', async () => {
    const root = temporaryDir()
    writeSettings(join(root, '.claude/settings.json'), { [PLUGIN_ID]: true })
    expect(await isContinuumPluginEnabled(root, temporaryDir())).toBe(true)
  })

  it('lets the more specific settings file win, as Claude Code does', async () => {
    const root = temporaryDir()
    const claudeDir = temporaryDir()
    writeSettings(join(claudeDir, 'settings.json'), { [PLUGIN_ID]: true })
    writeSettings(join(root, '.claude/settings.local.json'), { [PLUGIN_ID]: false })
    expect(await isContinuumPluginEnabled(root, claudeDir)).toBe(false)
  })

  it('ignores settings files it cannot read; other checks report those', async () => {
    const claudeDir = temporaryDir()
    writeFileSync(join(claudeDir, 'settings.json'), '{ not json')
    expect(await isContinuumPluginEnabled(temporaryDir(), claudeDir)).toBe(false)
  })
})

describe('defaultClaudeConfigDir', () => {
  it('follows CLAUDE_CONFIG_DIR, else ~/.claude', () => {
    expect(defaultClaudeConfigDir({ CLAUDE_CONFIG_DIR: '/custom' }, '/home/me')).toBe('/custom')
    expect(defaultClaudeConfigDir({}, '/home/me')).toBe(join('/home/me', '.claude'))
  })
})
