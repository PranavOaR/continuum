/**
 * The plugin installs Continuum's hooks for every repository. A hook in a
 * repository that does not use Continuum must cost next to nothing, so each one
 * first checks (with git, from the project Claude Code opened) whether the
 * repository has a .continuum store, and only then starts the CLI through npx.
 */
export function guardedPluginHooks(hooks: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(hooks).map(([event, groups]) => [
      event,
      (groups as { hooks: { command: string; args: string[] }[] }[]).map((group) => ({
        ...group,
        hooks: group.hooks.map(({ command, args, ...rest }) => ({ ...rest, type: 'command', command: 'sh', args: ['-c', guardScript([command, ...args])] })),
      })),
    ]),
  )
}

const quote = (part: string) => `'${part.replaceAll("'", `'\\''`)}'`

/** Skips the hook, reading the payload first: exiting with it unread breaks Claude Code's write to the hook (EPIPE). */
const SKIP = '{ cat >/dev/null; exit 0; }'

function guardScript(argv: readonly string[]): string {
  return [
    `root=$(git -C "\${CLAUDE_PROJECT_DIR:-.}" rev-parse --show-toplevel 2>/dev/null) || ${SKIP}`,
    `[ -d "$root/.continuum" ] || ${SKIP}`,
    `exec ${argv.map(quote).join(' ')}`,
  ].join('; ')
}
