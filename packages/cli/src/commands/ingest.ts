import { antigravityOutput, ingestHook, type HookAgent } from '@continuum/claude-code'
import { EXIT_OK, EXIT_USAGE, type Io } from '../io'

const AGENTS: readonly HookAgent[] = ['claude-code', 'codex', 'vscode', 'antigravity']

/**
 * Antigravity reads one JSON object from every hook, and its Stop hook must
 * say whether the turn may end, so a reply is printed even when recording
 * fails; the failure goes to stderr (and is noted for `doctor` by ingestHook).
 */
async function antigravityIngest(io: Io, options: Parameters<typeof ingestHook>[1], event: string): Promise<number> {
  let briefing: string | undefined
  try {
    const outcome = await ingestHook(await io.readStdin(), options)
    briefing = outcome.status === 'recorded' ? outcome.additionalContext : undefined
  } catch (error) {
    io.err(`continuum: ${error instanceof Error ? error.message : String(error)}`)
  }
  io.out(JSON.stringify(antigravityOutput(event, briefing)))
  return EXIT_OK
}

/**
 * Entry point for agent hooks (Claude Code by default, `--agent codex|vscode|antigravity`): reads
 * one payload from stdin. It never exits with 2, which agents treat as "block
 * this action", except for a mistyped agent that no hook would ever send.
 */
export async function ingestCommand(io: Io, args: readonly string[] = []): Promise<number> {
  const agent = args[0] === '--agent' ? args[1] : 'claude-code'
  if (!AGENTS.includes(agent as HookAgent)) {
    io.err(`continuum: ingest --agent must be one of ${AGENTS.join(', ')}`)
    return EXIT_USAGE
  }
  // Antigravity's payloads do not name their event, so its hooks pass it: `--agent antigravity --event SessionStart`.
  const event = args[2] === '--event' ? args[3] : undefined
  const options = { now: io.now, agent: agent as HookAgent, cwd: io.cwd, configDir: io.configDir, ...(event ? { event } : {}) }
  if (agent === 'antigravity') return antigravityIngest(io, options, event ?? '')
  const outcome = await ingestHook(await io.readStdin(), options)
  if (outcome.status === 'recorded' && outcome.additionalContext) {
    io.out(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: outcome.additionalContext } }))
  }
  // Shown to the person, never to Claude, and it does not keep the conversation going.
  if (outcome.status === 'recorded' && outcome.receipt) io.out(JSON.stringify({ systemMessage: outcome.receipt }))
  return EXIT_OK
}
