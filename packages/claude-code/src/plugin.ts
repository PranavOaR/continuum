/**
 * The plugin installs Continuum's hooks for every repository. A hook in a
 * repository that does not use Continuum must cost next to nothing, so each one
 * first checks (with git, from the project Claude Code opened) whether the
 * repository has a .continuum store, and only then starts the CLI.
 *
 * The plugin carries its own copy of the CLI (PLUGIN_BUNDLE, put there by
 * scripts/sync-plugin-repo.mjs), started with `node`: npx would add about half
 * a second to every hook, and SessionStart and Stop hold Claude Code up while
 * they run. Without the copy, the hooks fall back to npx.
 */

/** The CLI bundle's path inside the plugin directory. */
export const PLUGIN_BUNDLE = 'bin/continuum.js'

type CommandHandler = { command: string; args: string[] }

export function guardedPluginHooks(hooks: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(hooks).map(([event, groups]) => [
      event,
      (groups as { hooks: CommandHandler[] }[]).map((group) => ({
        ...group,
        hooks: group.hooks.map(({ command, args, ...rest }) => ({ ...rest, type: 'command', command: 'sh', args: ['-c', [...repositoryGuard(), runCli([command, ...args])].join('; ')] })),
      })),
    ]),
  )
}

/** The MCP servers, started from the plugin's copy of the CLI. */
export function pluginMcpServers(mcp: { mcpServers: Record<string, CommandHandler> }): { mcpServers: Record<string, CommandHandler> } {
  return {
    mcpServers: Object.fromEntries(Object.entries(mcp.mcpServers).map(([name, { command, args, ...rest }]) => [name, { ...rest, command: 'sh', args: ['-c', runCli([command, ...args])] }])),
  }
}

const quote = (part: string) => `'${part.replaceAll("'", `'\\''`)}'`

/** Skips the hook, reading the payload first: exiting with it unread breaks Claude Code's write to the hook (EPIPE). */
const SKIP = '{ cat >/dev/null; exit 0; }'

function repositoryGuard(): string[] {
  return [`root=$(git -C "\${CLAUDE_PROJECT_DIR:-.}" rev-parse --show-toplevel 2>/dev/null) || ${SKIP}`, `[ -d "$root/.continuum" ] || ${SKIP}`]
}

/** `fallback` is the npx command; its last part is the CLI subcommand. */
function runCli(fallback: readonly string[]): string {
  const bundle = `"\${CLAUDE_PLUGIN_ROOT}/${PLUGIN_BUNDLE}"`
  const subcommand = fallback.slice(-1).map(quote).join(' ')
  return `if [ -n "\${CLAUDE_PLUGIN_ROOT}" ] && [ -f ${bundle} ]; then exec node ${bundle} ${subcommand}; fi; exec ${fallback.map(quote).join(' ')}`
}
