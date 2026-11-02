import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { HOOKS_FILE } from './setup'

/** The Claude Code plugin's key in `enabledPlugins`: <plugin>@<marketplace> (plugin-repo/.claude-plugin/marketplace.json). */
export const PLUGIN_ID = 'continuum@continuum'

/** CLAUDE_CONFIG_DIR, else ~/.claude: where Claude Code keeps the user's settings. */
export function defaultClaudeConfigDir(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  return env.CLAUDE_CONFIG_DIR || join(home, '.claude')
}

/** Claude Code's settings files that can enable a plugin, from lowest to highest precedence. */
const settingsFiles = (root: string, claudeConfigDir: string) => [join(claudeConfigDir, 'settings.json'), join(root, '.claude/settings.json'), join(root, HOOKS_FILE)]

/** The `enabledPlugins` entry for Continuum in one settings file, or undefined when it says nothing. */
async function pluginSetting(path: string): Promise<boolean | undefined> {
  if (!existsSync(path)) return undefined
  try {
    const value = (JSON.parse(await readFile(path, 'utf8')) as { enabledPlugins?: Record<string, unknown> } | null)?.enabledPlugins?.[PLUGIN_ID]
    return typeof value === 'boolean' ? value : undefined
  } catch {
    // An unreadable settings file is reported where it matters (doctor, setup); here it just says nothing.
    return undefined
  }
}

/**
 * Whether Claude Code runs the Continuum plugin in this repository. With the
 * project hooks from `setup claude-code` as well, every hook would fire twice.
 */
export async function isContinuumPluginEnabled(root: string, claudeConfigDir: string): Promise<boolean> {
  const settings = await Promise.all(settingsFiles(root, claudeConfigDir).map(pluginSetting))
  return settings.reduce<boolean>((enabled, value) => value ?? enabled, false)
}
