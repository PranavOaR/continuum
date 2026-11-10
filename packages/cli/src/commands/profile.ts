import { readProfile, writeProfile } from '@continuum/capture'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const PROFILE_USAGE = 'Usage: continuum profile [add "<preference>" | remove <number>]'

function list(io: Io, preferences: readonly string[]): void {
  if (preferences.length === 0) {
    io.out('No preferences yet. Add one that should hold in every repository: continuum profile add "Use pnpm, never npm"')
    return
  }
  io.out('Your preferences, labelled set by you in every repository\'s briefing on this machine:')
  preferences.forEach((preference, index) => io.out(`  ${index + 1}. ${preference}`))
}

/**
 * Shows or changes your profile: preferences kept on this machine, outside any
 * repository, that every repository's briefing carries.
 */
export async function profileCommand(io: Io, args: readonly string[]): Promise<number> {
  const [action, ...rest] = args
  const { preferences } = await readProfile(io.configDir)
  if (action === undefined) {
    list(io, preferences)
    return EXIT_OK
  }
  if (action === 'add' && rest.join(' ').trim() !== '') {
    list(io, (await writeProfile(io.configDir, [...preferences, rest.join(' ')])).preferences)
    return EXIT_OK
  }
  if (action === 'remove' && rest.length === 1) {
    const position = Number(rest[0])
    if (!Number.isInteger(position) || position < 1 || position > preferences.length) {
      io.err(`continuum: there is no preference ${rest[0]}; run \`continuum profile\` to see their numbers.`)
      return EXIT_FAILURE
    }
    list(io, (await writeProfile(io.configDir, preferences.filter((_preference, index) => index !== position - 1))).preferences)
    return EXIT_OK
  }
  io.err(PROFILE_USAGE)
  return EXIT_USAGE
}
