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

/**
 * Returns null for hook events Continuum does not handle, and throws on malformed input.
 * `prepare` fills in what an agent's payloads leave out (see `withVsCodeDefaults`).
 */
export function parseHookPayload(raw: string, prepare?: (data: Record<string, unknown>) => Record<string, unknown>): HookPayload | null {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new InvalidHookPayloadError('not JSON')
  }
  const data = prepare && typeof json === 'object' && json !== null && !Array.isArray(json) ? prepare(json as Record<string, unknown>) : json
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

/** Continuum's MCP task tools as VS Code names them: `mcp_<server>_<tool>`. */
export const VSCODE_TASK_TOOLS = ['mcp_continuum_start_task', 'mcp_continuum_update_task'] as const

/** The task a successful start_task/update_task call reported ("Task <id>: …"), so the calling session can be linked to it. */
export function reportedTaskId(payload: HookPayload): string | null {
  if (payload.hook_event_name !== 'PostToolUse' || !([...TASK_TOOLS, ...VSCODE_TASK_TOOLS] as readonly string[]).includes(payload.tool_name)) return null
  // The response is searched as JSON text, where the quote after the id is escaped.
  const match = /Task ([a-z0-9][a-z0-9-]{0,99}): \\?"/.exec(JSON.stringify(payload.tool_response ?? ''))
  return match ? match[1] : null
}

/**
 * Agents whose hooks Continuum understands. Codex's hooks use the same events
 * and fields as Claude Code's; VS Code's (Copilot agent mode) nearly do, see `withVsCodeDefaults`.
 */
export type HookAgent = 'claude-code' | 'codex' | 'vscode'

/** Codex edits files through one tool whose input is a patch naming every file it touches; Copilot in VS Code has one too. */
export const PATCH_TOOL = 'apply_patch'

/**
 * Copilot's file-editing tools in VS Code, and the input field naming the file:
 * the internal names and the `copilot_*` names VS Code also exposes them under.
 */
export const VSCODE_EDIT_TOOLS: Readonly<Record<string, string>> = {
  create_file: 'filePath',
  replace_string_in_file: 'filePath',
  insert_edit_into_file: 'filePath',
  edit_notebook_file: 'filePath',
  copilot_createFile: 'filePath',
  copilot_replaceString: 'filePath',
  copilot_insertEdit: 'filePath',
  copilot_editNotebook: 'filePath',
}

/** Copilot tools that edit several files at once: `replacements` lists each file. */
export const VSCODE_MULTI_EDIT_TOOLS = ['multi_replace_string_in_file', 'copilot_multiReplaceString'] as const

/** Copilot's patch tool, under both its names; its input is the same patch format as Codex's. */
export const VSCODE_PATCH_TOOLS = [PATCH_TOOL, 'copilot_applyPatch'] as const

/** Every tool whose use Continuum records from VS Code: its edits and Continuum's task tools. */
export const VSCODE_RECORDED_TOOLS: readonly string[] = [...Object.keys(VSCODE_EDIT_TOOLS), ...VSCODE_MULTI_EDIT_TOOLS, ...VSCODE_PATCH_TOOLS, ...VSCODE_TASK_TOOLS]

/** VS Code's hook input says "optional" of the session id and cwd, and some builds spell fields in camelCase. */
const VSCODE_FIELD_ALIASES: Readonly<Record<string, string>> = {
  sessionId: 'session_id',
  hookEventName: 'hook_event_name',
  toolName: 'tool_name',
  toolInput: 'tool_input',
  toolResponse: 'tool_response',
  transcriptPath: 'transcript_path',
}

/**
 * A VS Code payload in the shape Claude Code's has: snake_case fields, the
 * working directory the hook ran in when none is given, and a session id
 * derived from the transcript path when VS Code sends none.
 */
export function withVsCodeDefaults(cwd: string, sessionFrom: (transcriptPath: string) => string): (data: Record<string, unknown>) => Record<string, unknown> {
  return (data) => {
    // A camelCase field is used only when its snake_case spelling is absent.
    const merged = Object.fromEntries(
      Object.entries(data)
        .filter(([key]) => !(Object.hasOwn(VSCODE_FIELD_ALIASES, key) && Object.hasOwn(data, VSCODE_FIELD_ALIASES[key])))
        .map(([key, value]) => [Object.hasOwn(VSCODE_FIELD_ALIASES, key) ? VSCODE_FIELD_ALIASES[key] : key, value]),
    )
    const transcript = typeof merged.transcript_path === 'string' && merged.transcript_path !== '' ? merged.transcript_path : null
    const sessionId = typeof merged.session_id === 'string' && merged.session_id !== '' ? merged.session_id : transcript ? sessionFrom(transcript) : undefined
    const workingDir = typeof merged.cwd === 'string' && merged.cwd !== '' ? merged.cwd : cwd
    // An object for a tool's input, as the schema expects; VS Code may send none for tools without parameters.
    const toolInput = merged.hook_event_name === 'PostToolUse' && merged.tool_input === undefined ? { tool_input: {} } : {}
    return { ...merged, cwd: workingDir, ...(sessionId ? { session_id: sessionId } : {}), ...toolInput }
  }
}

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

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

/** The patch an apply_patch call carried: Codex sends it as `command` or `patch`, VS Code as `input`. */
function patchOf(input: Record<string, unknown>): string {
  return text(input.command) ?? text(input.patch) ?? text(input.input) ?? ''
}

/** Each file a multi-file replace names, once. */
function replacedFiles(input: Record<string, unknown>): EditedFile[] {
  const replacements = Array.isArray(input.replacements) ? input.replacements : []
  const paths = replacements.map((replacement: unknown) => (typeof replacement === 'object' && replacement !== null ? text((replacement as Record<string, unknown>).filePath) : null))
  return [...new Set(paths.filter((path): path is string => path !== null))].map((path) => ({ path }))
}

/** Every file a successful tool call wrote: one for a single-file edit tool, any number for a patch or a multi-file replace. */
export function editedFiles(payload: HookPayload): EditedFile[] {
  if (payload.hook_event_name !== 'PostToolUse') return []
  if ((VSCODE_PATCH_TOOLS as readonly string[]).includes(payload.tool_name)) return patchedFiles(patchOf(payload.tool_input))
  if ((VSCODE_MULTI_EDIT_TOOLS as readonly string[]).includes(payload.tool_name)) return replacedFiles(payload.tool_input)
  const path = editedPath(payload)
  return path ? [{ path }] : []
}

/** The absolute path a single-file editing tool call wrote, if this payload is one. */
export function editedPath(payload: HookPayload): string | null {
  if (payload.hook_event_name !== 'PostToolUse') return null
  const field = FILE_EDIT_TOOLS[payload.tool_name] ?? VSCODE_EDIT_TOOLS[payload.tool_name]
  return field ? text(payload.tool_input[field]) : null
}
