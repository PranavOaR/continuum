import { SHELL_TOOL, type HookPayload } from './hookPayload'

/** Longest agent check output kept, matching `continuum run`'s tail. */
export const MAX_AGENT_OUTPUT_CHARS = 4_000

/**
 * Commands that check the code: test runners, linters, type checkers and builds.
 * Deliberately narrow; anything else an agent runs (ls, git, cat) is not evidence.
 */
const CHECK_COMMANDS: readonly RegExp[] = [
  /^(npm|pnpm|yarn|bun)( run)? (test|lint|typecheck|type-check|check|build)([:\w-]*)?(\s|$)/,
  /^(npx |pnpm exec |pnpm dlx |yarn |bunx )?(vitest|jest|mocha|ava|playwright test|tsc|eslint|oxlint|biome (check|lint)|prettier --check)(\s|$)/,
  /^(python3? -m )?(pytest|mypy|ruff( check)?|flake8|pylint|unittest)(\s|$)/,
  /^(go (test|vet|build)|cargo (test|check|clippy|build)|make (test|check|lint|build)|mvn (test|verify)|gradle(w)? (test|check|build)|\.\/gradlew (test|check|build)|dotnet (test|build)|rspec|bundle exec rspec|phpunit|mix test|swift test)(\s|$)/,
]

/**
 * The check a shell command runs, or null. Compound commands only count when
 * the exit code is the check's own: `cd app && npm test` qualifies, while
 * pipes, `;`, `||` and backgrounding hide or replace the check's exit code.
 */
export function recognizeCheck(command: string): string | null {
  // Several lines run as a script: the exit code is the last line's, not the check's.
  if (/[\r\n]/.test(command.trim())) return null
  const withoutRedirects = command.replace(/\s\d?>&\d/g, ' ').replace(/\s\d?>>?\s*\S+/g, ' ')
  if (/[|;&]/.test(withoutRedirects.replace(/&&/g, ''))) return null
  const last = withoutRedirects.split('&&').at(-1)?.trim().replace(/\s+/g, ' ') ?? ''
  const unprefixed = last.replace(/^(\w+=\S*\s+)+/, '') // CI=1 npm test
  if (!CHECK_COMMANDS.some((pattern) => pattern.test(unprefixed))) return null
  return unprefixed
}

/** The exit code Claude Code reports in a failed Bash call's error ("Exit code 1\n…"). */
export function exitCodeFromError(error: string | undefined): number | null {
  const match = /^Exit code (\d+)/.exec(error ?? '')
  return match ? Number(match[1]) : null
}

/** The last part of the command's output, redacted, for the record. */
export function outputTail(redact: (text: string) => string, ...parts: unknown[]): string | undefined {
  const text = parts.filter((part): part is string => typeof part === 'string' && part !== '').join('\n')
  // Redact before cutting, so a secret split by the cut cannot slip through as a fragment.
  return text === '' ? undefined : redact(text).slice(-MAX_AGENT_OUTPUT_CHARS)
}

/** A check an agent ran, as observed from its Bash tool call. */
export interface AgentCheck {
  name: string
  command: string
  exitCode: number
  durationMs: number
  outputTail?: string
}

/**
 * The check a Bash tool call ran, with the exit code Claude Code observed, or
 * null. Interrupted, backgrounded and unrecognized commands are not evidence.
 */
export function agentCheckOf(payload: HookPayload, redact: (text: string) => string): AgentCheck | null {
  if ((payload.hook_event_name !== 'PostToolUse' && payload.hook_event_name !== 'PostToolUseFailure') || payload.tool_name !== SHELL_TOOL) return null
  const command = typeof payload.tool_input.command === 'string' ? payload.tool_input.command : ''
  if (payload.tool_input.run_in_background === true) return null
  const recognized = recognizeCheck(command)
  if (!recognized) return null
  const name = redact(recognized)
  const durationMs = typeof payload.duration_ms === 'number' ? payload.duration_ms : 0
  if (payload.hook_event_name === 'PostToolUseFailure') {
    const exitCode = payload.is_interrupt ? null : exitCodeFromError(payload.error)
    if (exitCode === null) return null
    const output = outputTail(redact, payload.error?.replace(/^Exit code \d+\n?/, ''))
    return { name, command: redact(command), exitCode, durationMs, ...(output ? { outputTail: output } : {}) }
  }
  const response = (payload.tool_response ?? {}) as { stdout?: unknown; stderr?: unknown; interrupted?: unknown }
  if (response.interrupted === true) return null
  const output = outputTail(redact, response.stdout, response.stderr)
  return { name, command: redact(command), exitCode: 0, durationMs, ...(output ? { outputTail: output } : {}) }
}
