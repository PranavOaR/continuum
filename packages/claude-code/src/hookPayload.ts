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

const userPromptSubmit = z.looseObject({ ...common, hook_event_name: z.literal('UserPromptSubmit'), prompt: z.string() })

/** A tool call that failed; for Bash, `error` starts with "Exit code N" when the command ran. */
const postToolUseFailure = z.looseObject({
  ...common,
  hook_event_name: z.literal('PostToolUseFailure'),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
  error: z.string().optional(),
  is_interrupt: z.boolean().optional(),
  duration_ms: z.number().optional(),
})

export const hookPayloadSchema = z.discriminatedUnion('hook_event_name', [sessionStart, sessionEnd, stop, postToolUse, postToolUseFailure, userPromptSubmit])
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

/** The shell tool whose test, lint and build runs are recorded as agent checks. */
export const SHELL_TOOL = 'Bash'

/** Continuum's own MCP task tools, as Claude Code names them in hooks. */
export const TASK_TOOLS = ['mcp__continuum__start_task', 'mcp__continuum__update_task'] as const

/** The task a successful start_task/update_task call reported ("Task <id>: …"), so the calling session can be linked to it. */
export function reportedTaskId(payload: HookPayload): string | null {
  if (payload.hook_event_name !== 'PostToolUse' || !(TASK_TOOLS as readonly string[]).includes(payload.tool_name)) return null
  // The response is searched as JSON text, where the quote after the id is escaped.
  const match = /Task ([a-z0-9][a-z0-9-]{0,99}): \\?"/.exec(JSON.stringify(payload.tool_response ?? ''))
  return match ? match[1] : null
}

/** Agents whose hooks Continuum understands. Codex's hooks use the same events and fields as Claude Code's. */
export type HookAgent = 'claude-code' | 'codex'

/** Codex edits files through one tool whose input is a patch naming every file it touches. */
export const PATCH_TOOL = 'apply_patch'

/** A file a tool call changed, and how, when the tool says so. */
export interface EditedFile {
  path: string
  changeType?: 'added' | 'modified' | 'deleted'
}

const PATCH_HEADER = /^\*\*\* (Add|Update|Delete) File: (.+)$/
const PATCH_MOVE = /^\*\*\* Move to: (.+)$/

/**
 * Every file an apply_patch call names: added, updated and deleted files, and
 * for a move (`*** Update File: old` then `*** Move to: new`) the old path as
 * deleted and the new one as added.
 */
export function patchedFiles(patch: string): EditedFile[] {
  const files: EditedFile[] = []
  for (const line of patch.split('\n')) {
    const header = PATCH_HEADER.exec(line)
    if (header) {
      const kind = header[1] === 'Add' ? 'added' : header[1] === 'Delete' ? 'deleted' : 'modified'
      files.push({ path: header[2].trim(), changeType: kind })
      continue
    }
    const moved = PATCH_MOVE.exec(line)
    if (!moved) continue
    const source = files.at(-1)
    if (source?.changeType === 'modified') files[files.length - 1] = { ...source, changeType: 'deleted' }
    files.push({ path: moved[1].trim(), changeType: 'added' })
  }
  return files
}

/** Every file a successful tool call wrote: one for Claude Code's edit tools, any number for a patch. */
export function editedFiles(payload: HookPayload): EditedFile[] {
  if (payload.hook_event_name !== 'PostToolUse') return []
  if (payload.tool_name === PATCH_TOOL) {
    const patch = typeof payload.tool_input.command === 'string' ? payload.tool_input.command : typeof payload.tool_input.patch === 'string' ? payload.tool_input.patch : ''
    return patchedFiles(patch)
  }
  const path = editedPath(payload)
  return path ? [{ path }] : []
}

/** The absolute path a file-editing tool call wrote, if this payload is one. */
export function editedPath(payload: HookPayload): string | null {
  if (payload.hook_event_name !== 'PostToolUse') return null
  const field = FILE_EDIT_TOOLS[payload.tool_name]
  const value = field ? payload.tool_input[field] : undefined
  return typeof value === 'string' && value !== '' ? value : null
}
