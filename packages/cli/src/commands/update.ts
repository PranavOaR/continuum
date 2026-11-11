import { existsSync } from 'node:fs'
import { isInitialized, locateWorkspace, openWorkspace, readRegistry, scanRepository } from '@continuum/capture'
import { isContinuumPluginEnabled, setUpAgents, type Invocation } from '@continuum/claude-code'
import { EXIT_OK, EXIT_USAGE, type Io } from '../io'
import { TARGETS } from './setup'

export const UPDATE_USAGE = 'Usage: continuum update [--all]'

/** What the agents' configurations will run from now on, as a person would name it. */
function versionName({ command, args }: Invocation): string {
  const pinned = [command, ...args].find((part) => /^(@[\w.-]+\/)?getcontinuum@/.test(part))
  return pinned ?? 'this copy of Continuum'
}

/** Re-runs setup, at the running version, for each agent setup connected here; says what it did. */
async function updateRepository(io: Io, root: string, invocation: Invocation): Promise<void> {
  const agents = (await setUpAgents(root)).filter((agent) => Object.hasOwn(TARGETS, agent))
  const hasPlugin = await isContinuumPluginEnabled(root, io.claudeConfigDir)
  if (agents.length === 0) {
    io.out(`${root}: no agent was connected here by \`continuum setup\`, so there is nothing to update.`)
  } else {
    for (const agent of agents) await TARGETS[agent].setup(root, invocation)
    // Record the rewritten files now, so they do not show up later as changes no session explains.
    const { store } = await openWorkspace(root)
    try {
      await scanRepository(store, root, { now: io.now })
    } finally {
      store.close()
    }
    io.out(`${root}: ${agents.map((agent) => TARGETS[agent].name).join(', ')} now run ${versionName(invocation)}.`)
  }
  if (hasPlugin) io.out(`  The Claude Code plugin updates through Claude Code: run /plugin, open continuum and choose Update.`)
}

/** Repositories to update: this one, or with --all every one `setup` connected that is still set up. */
async function repositories(io: Io, isAll: boolean): Promise<string[]> {
  if (!isAll) return [(await locateWorkspace(io.cwd)).root]
  const roots = (await readRegistry(io.configDir)).map(({ root }) => root).filter((root) => existsSync(root))
  const settled = await Promise.all(roots.map(async (root) => ((await locateWorkspace(root).then(isInitialized, () => false)) ? root : null)))
  return settled.filter((root): root is string => root !== null)
}

/**
 * Brings the agents' configurations up to the version running this command.
 * `setup` pins a version, so a release reaches an agent only once its
 * configuration names it: `npx getcontinuum@latest update` does that.
 */
export async function updateCommand(io: Io, args: readonly string[], invocation: Invocation): Promise<number> {
  const isAll = args.length === 1 && args[0] === '--all'
  if (args.length > 0 && !isAll) {
    io.err(`continuum: unknown option for update: ${args.join(' ')}`)
    io.err(UPDATE_USAGE)
    return EXIT_USAGE
  }
  const roots = await repositories(io, isAll)
  if (roots.length === 0) {
    io.out('No repository is connected yet. Run `continuum setup <agent>` in one first.')
    return EXIT_OK
  }
  for (const root of roots) await updateRepository(io, root, invocation)
  io.out('Start a new agent session in each repository to use it.')
  return EXIT_OK
}
