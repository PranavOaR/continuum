import { ingestHook } from '@continuum/claude-code'
import { EXIT_OK, type Io } from '../io'

/**
 * Entry point for Claude Code hooks: reads one payload from stdin. It never
 * exits with 2, which Claude Code treats as "block this action".
 */
export async function ingestCommand(io: Io): Promise<number> {
  const outcome = await ingestHook(await io.readStdin(), { now: io.now })
  if (outcome.status === 'recorded' && outcome.additionalContext) {
    io.out(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: outcome.additionalContext } }))
  }
  return EXIT_OK
}
