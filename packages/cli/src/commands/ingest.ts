import { ingestHook, type HookAgent } from '@continuum/claude-code'
import { EXIT_OK, EXIT_USAGE, type Io } from '../io'

const AGENTS: readonly HookAgent[] = ['claude-code', 'codex']

/**
 * Entry point for agent hooks (Claude Code by default, `--agent codex`): reads
 * one payload from stdin. It never exits with 2, which agents treat as "block
 * this action", except for a mistyped agent that no hook would ever send.
 */
export async function ingestCommand(io: Io, args: readonly string[] = []): Promise<number> {
  const agent = args[0] === '--agent' ? args[1] : 'claude-code'
  if (!AGENTS.includes(agent as HookAgent)) {
    io.err(`continuum: ingest --agent must be one of ${AGENTS.join(', ')}`)
    return EXIT_USAGE
  }
  const outcome = await ingestHook(await io.readStdin(), { now: io.now, agent: agent as HookAgent })
  if (outcome.status === 'recorded' && outcome.additionalContext) {
    io.out(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: outcome.additionalContext } }))
  }
  return EXIT_OK
}
