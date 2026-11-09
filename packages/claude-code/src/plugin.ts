/**
 * The plugin installs Continuum's hooks for every repository. A hook in a
 * repository that does not use Continuum must cost next to nothing, so each one
 * first checks whether the repository has a .continuum store, and only then
 * starts the CLI.
 *
 * The plugin carries its own copy of the CLI (PLUGIN_BUNDLE, put there by
 * scripts/sync-plugin-repo.mjs): npx would add about half a second to every
 * hook, and SessionStart and Stop hold Claude Code up while they run. Without
 * the copy, the hooks fall back to npx.
 *
 * Both are done by PLUGIN_LAUNCHER, which Claude Code starts with node and no
 * shell, so the same entries work on Windows, macOS and Linux.
 */

/** The CLI bundle's path inside the plugin directory. */
export const PLUGIN_BUNDLE = 'bin/continuum.js'
/** The launcher's path inside the plugin directory (plugin/launcher.mjs in this repository). */
export const PLUGIN_LAUNCHER = 'launcher.mjs'
/** Tells the launcher to skip unless the repository uses Continuum. */
export const LAUNCHER_GUARD = '--if-continuum'

type CommandHandler = { command: string; args: string[] }

const launcher = (...rest: string[]): CommandHandler => ({ command: 'node', args: [`\${CLAUDE_PLUGIN_ROOT}/${PLUGIN_LAUNCHER}`, ...rest] })

export function guardedPluginHooks(hooks: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(hooks).map(([event, groups]) => [
      event,
      (groups as { hooks: CommandHandler[] }[]).map((group) => ({
        ...group,
        hooks: group.hooks.map(({ command, args, ...rest }) => ({ ...rest, type: 'command', ...launcher(LAUNCHER_GUARD, command, ...args) })),
      })),
    ]),
  )
}

/** The MCP servers, started from the plugin's copy of the CLI. */
export function pluginMcpServers(mcp: { mcpServers: Record<string, CommandHandler> }): { mcpServers: Record<string, CommandHandler> } {
  return {
    mcpServers: Object.fromEntries(Object.entries(mcp.mcpServers).map(([name, { command, args, ...rest }]) => [name, { ...rest, ...launcher(command, ...args) }])),
  }
}
