import { z } from 'zod'

/**
 * The subset of Claude Code hook input that Continuum uses. Objects are loose:
 * Claude Code adds fields over time, and unknown ones must not break capture.
 * See https://code.claude.com/docs/en/hooks.
 */
const common = {
  session_id: z.string().min(1),
  cwd: z.string().min(1),
}

const sessionStart = z.looseObject({ ...common, hook_event_name: z.literal('SessionStart'), source: z.string().optional() })
const sessionEnd = z.looseObject({ ...common, hook_event_name: z.literal('SessionEnd'), reason: z.string().optional() })
const stop = z.looseObject({ ...common, hook_event_name: z.literal('Stop'), last_assistant_message: z.string().optional() })
const postToolUse = z.looseObject({
  ...common,
  hook_event_name: z.literal('PostToolUse'),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
  tool_response: z.unknown().optional(),
})

export const hookPayloadSchema = z.discriminatedUnion('hook_event_name', [sessionStart, sessionEnd, stop, postToolUse])
export type HookPayload = z.infer<typeof hookPayloadSchema>

export class InvalidHookPayloadError extends Error {
  constructor(reason: string) {
    super(`Invalid Claude Code hook payload: ${reason}`)
    this.name = 'InvalidHookPayloadError'
  }
}

/** Returns null for hook events Continuum does not handle, and throws on malformed input. */
export function parseHookPayload(raw: string): HookPayload | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new InvalidHookPayloadError('not JSON')
  }
  const event = typeof data === 'object' && data !== null ? (data as { hook_event_name?: unknown }).hook_event_name : undefined
  if (typeof event === 'string' && !hookPayloadSchema.options.some((option) => option.shape.hook_event_name.value === event)) return null
  const parsed = hookPayloadSchema.safeParse(data)
  if (!parsed.success) throw new InvalidHookPayloadError(parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; '))
  return parsed.data
}

/** Tools whose successful use means a file on disk changed, and the input field naming it. */
export const FILE_EDIT_TOOLS: Readonly<Record<string, string>> = {
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
}

/** The absolute path a file-editing tool call wrote, if this payload is one. */
export function editedPath(payload: HookPayload): string | null {
  if (payload.hook_event_name !== 'PostToolUse') return null
  const field = FILE_EDIT_TOOLS[payload.tool_name]
  const value = field ? payload.tool_input[field] : undefined
  return typeof value === 'string' && value !== '' ? value : null
}
