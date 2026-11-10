/**
 * Antigravity CLI (`agy`, which replaced Gemini CLI in 2026) runs project hooks
 * from .agents/hooks.json. Its payloads differ from Claude Code's: camelCase
 * fields, no event name (each hook command passes it as `--event`), the
 * conversation as the session, and the tool call as `toolCall.name` and
 * `toolCall.args`. See https://antigravity.google/docs/hooks/.
 */

/** The events Continuum hooks: a briefing at the start, file edits, and the end of each turn. */
export const ANTIGRAVITY_EVENTS = ['SessionStart', 'PostToolUse', 'Stop'] as const
export type AntigravityEvent = (typeof ANTIGRAVITY_EVENTS)[number]

/** Antigravity's file-editing tools, and the Claude Code tool each one is recorded as. All name the file in `TargetFile`. */
export const ANTIGRAVITY_EDIT_TOOLS: Readonly<Record<string, 'Write' | 'Edit'>> = {
  write_to_file: 'Write',
  replace_file_content: 'Edit',
  multi_replace_file_content: 'Edit',
}

/** An event name parseHookPayload does not know, so the hook is ignored rather than refused. */
const IGNORED = { hook_event_name: 'Ignored' }

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

/**
 * Turns one Antigravity payload into the hook payload the rest of ingestion
 * reads. `cwd` stands in when the payload names no workspace. Anything
 * Continuum does not record (another event, another tool, an edit that
 * failed, a payload with no conversation) becomes an event it ignores.
 */
export function fromAntigravity(event: string, cwd: string): (data: Json) => Json {
  return (data) => {
    const sessionId = text(data.conversationId)
    if (!sessionId || !(ANTIGRAVITY_EVENTS as readonly string[]).includes(event)) return IGNORED
    const workspace = Array.isArray(data.workspacePaths) ? text(data.workspacePaths[0]) : null
    const common = { session_id: sessionId, cwd: workspace ?? cwd, ...(text(data.transcriptPath) ? { transcript_path: data.transcriptPath } : {}) }
    if (event === 'SessionStart') return { ...common, hook_event_name: 'SessionStart', source: 'startup' }
    if (event === 'Stop') return { ...common, hook_event_name: 'Stop' }
    const call = isObject(data.toolCall) ? data.toolCall : {}
    const tool = typeof call.name === 'string' && Object.hasOwn(ANTIGRAVITY_EDIT_TOOLS, call.name) ? ANTIGRAVITY_EDIT_TOOLS[call.name] : null
    const file = isObject(call.args) ? text(call.args.TargetFile) : null
    if (!tool || !file || text(data.error)) return IGNORED
    return { ...common, hook_event_name: 'PostToolUse', tool_name: tool, tool_input: { file_path: file } }
  }
}

/**
 * What a hook prints for Antigravity. A session start injects the briefing as
 * a system step; a Stop hook must decide, and anything but "continue" lets
 * the turn end; every other event takes an empty object.
 */
export function antigravityOutput(event: string, briefing: string | undefined): Json {
  if (event === 'SessionStart') return briefing ? { injectSteps: [{ systemMessage: { systemMessage: briefing } }] } : {}
  return event === 'Stop' ? { decision: 'stop' } : {}
}
