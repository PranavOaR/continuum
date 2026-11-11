import { openWorkspace, readConfig, updateConfig, type ContinuumConfig } from '@continuum/capture'
import { EXIT_OK, EXIT_USAGE, type Io } from '../io'
import { isUpdateCheckEnabled, setUpdateCheck } from '../updateCheck'

export const CONFIG_USAGE = 'Usage: continuum config [<setting> on|off]'
/** A setting of yours rather than the repository's, so it works anywhere and holds for every repository. */
const UPDATE_CHECK = 'update-check'
const UPDATE_CHECK_DESCRIPTION = 'once a day, ask npm whether a newer Continuum exists (yours, for every repository)'

/** Command-line names of the settings, and what each one does. */
const SETTINGS: Record<string, { key: keyof ContinuumConfig; description: string }> = {
  'agent-checks': { key: 'agentChecks', description: 'record tests, lint and builds an agent runs (observed exit code)' },
  prompts: { key: 'capturePrompts', description: 'record the prompts you type to agents, redacted' },
  receipts: { key: 'receipts', description: 'after a Claude Code reply, show one line of what was recorded' },
}

const VALUES: Record<string, boolean> = { on: true, off: false }

/** Shows or changes this repository's Continuum settings, and your update check. */
export async function configCommand(io: Io, args: readonly string[]): Promise<number> {
  if (args[0] === UPDATE_CHECK) {
    if (args.length !== 2 || !Object.hasOwn(VALUES, args[1])) {
      io.err('continuum: expected on or off')
      io.err(CONFIG_USAGE)
      return EXIT_USAGE
    }
    await setUpdateCheck(io.configDir, VALUES[args[1]])
    io.out(`${UPDATE_CHECK} is now ${args[1]} for every repository on this machine.`)
    return EXIT_OK
  }
  const { workspace, store } = await openWorkspace(io.cwd)
  store.close()
  if (args.length === 0) {
    const config = await readConfig(workspace.root)
    for (const [name, { key, description }] of Object.entries(SETTINGS)) io.out(`${name.padEnd(13)} ${config[key] ? 'on ' : 'off'}  ${description}`)
    io.out(`${UPDATE_CHECK.padEnd(13)} ${(await isUpdateCheckEnabled(io.configDir)) ? 'on ' : 'off'}  ${UPDATE_CHECK_DESCRIPTION}`)
    return EXIT_OK
  }
  const [name, value] = args
  const setting = Object.hasOwn(SETTINGS, name) ? SETTINGS[name] : undefined
  if (!setting || args.length !== 2 || !Object.hasOwn(VALUES, value)) {
    io.err(`continuum: ${setting ? 'expected on or off' : `unknown setting "${name}"; settings: ${[...Object.keys(SETTINGS), UPDATE_CHECK].join(', ')}`}`)
    io.err(CONFIG_USAGE)
    return EXIT_USAGE
  }
  await updateConfig(workspace.root, { [setting.key]: VALUES[value] })
  io.out(`${name} is now ${value} for ${workspace.root}.`)
  return EXIT_OK
}
