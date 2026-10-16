import { openWorkspace, readConfig, updateConfig, type ContinuumConfig } from '@continuum/capture'
import { EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const CONFIG_USAGE = 'Usage: continuum config [<setting> on|off]'

/** Command-line names of the settings, and what each one does. */
const SETTINGS: Record<string, { key: keyof ContinuumConfig; description: string }> = {
  'agent-checks': { key: 'agentChecks', description: 'record tests, lint and builds an agent runs (observed exit code)' },
  prompts: { key: 'capturePrompts', description: 'record the prompts you type to agents, redacted' },
}

const VALUES: Record<string, boolean> = { on: true, off: false }

/** Shows or changes this repository's Continuum settings. */
export async function configCommand(io: Io, args: readonly string[]): Promise<number> {
  const { workspace, store } = await openWorkspace(io.cwd)
  store.close()
  if (args.length === 0) {
    const config = await readConfig(workspace.root)
    for (const [name, { key, description }] of Object.entries(SETTINGS)) io.out(`${name.padEnd(13)} ${config[key] ? 'on ' : 'off'}  ${description}`)
    return EXIT_OK
  }
  const [name, value] = args
  const setting = Object.hasOwn(SETTINGS, name) ? SETTINGS[name] : undefined
  if (!setting || args.length !== 2 || !Object.hasOwn(VALUES, value)) {
    io.err(`continuum: ${setting ? 'expected on or off' : `unknown setting "${name}"; settings: ${Object.keys(SETTINGS).join(', ')}`}`)
    io.err(CONFIG_USAGE)
    return EXIT_USAGE
  }
  await updateConfig(workspace.root, { [setting.key]: VALUES[value] })
  io.out(`${name} is now ${value} for ${workspace.root}.`)
  return EXIT_OK
}
