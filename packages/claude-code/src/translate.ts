import { redactSecrets } from '@continuum/capture'
import type { ChangeType, ContentHash, ContinuumEvent } from '@continuum/core'
import type { AgentCheck } from './agentCheck'
import type { HookAgent, HookPayload } from './hookPayload'

export const ADAPTER_SOURCE = 'adapter:claude-code'
/** Where an agent's hook events come from in the event log. */
export const adapterSource = (agent: HookAgent) => `adapter:${agent}`
/** Longest agent note kept per turn; the handoff quotes far less. */
export const MAX_NOTE_CHARS = 2_000
/** Longest prompt kept; the handoff quotes far less. */
export const MAX_PROMPT_CHARS = 2_000
const FRESH_SESSION_SOURCES = new Set(['startup', 'clear', 'fork'])

export interface FileEdit {
  /** Repository-relative path. */
  path: string
  /** Blob hash after the edit, or null if the file no longer exists. */
  contentHash: ContentHash | null
  /** How the tool said it changed the file, when it did (a patch names added and deleted files). */
  changeType?: ChangeType
}

export interface TranslateContext {
  now: Date
  revision: string | null
  /** Whether the store already knows this session (resume and compact reuse the id). */
  knownSession: boolean
  /** Which agent's hooks sent this payload. Defaults to Claude Code. */
  agent?: HookAgent
  /** Files the payload's tool call changed, inside what scans capture. */
  edits?: FileEdit[]
  /** The task currently being worked on, if one is recorded. */
  taskId?: string
  /** Set when a task tool call linked this session to a task. */
  sessionTaskId?: string
  /** Set when prompt capture is on: the prompt, redacted and bounded. */
  prompt?: string
  /** Set when the payload is a check the agent ran, with the stored coverage manifest of the tree it ran against. */
  check?: AgentCheck & { coverage: ContentHash }
}

function changeTypeOf(payload: Extract<HookPayload, { hook_event_name: 'PostToolUse' }>, edit: FileEdit): ChangeType {
  if (edit.contentHash === null) return 'deleted'
  if (edit.changeType) return edit.changeType
  const response = payload.tool_response as { type?: unknown } | undefined
  return payload.tool_name === 'Write' && response?.type === 'create' ? 'added' : 'modified'
}

/** Observed, not verified: Claude Code reported the exit code; Continuum did not run the command itself. */
function checkEvent(base: { source: string; occurredAt: string; revision?: string }, check: AgentCheck & { coverage: ContentHash }): ContinuumEvent {
  const { name, command, exitCode, durationMs, coverage, outputTail } = check
  return { ...base, type: 'check.recorded', evidence: 'observed', payload: { name, command, exitCode, durationMs, coverage, ...(outputTail ? { outputTail } : {}) } }
}

/** Pure mapping from one Claude Code hook payload to the events it implies. */
export function translateHook(payload: HookPayload, context: TranslateContext): ContinuumEvent[] {
  const agent = context.agent ?? 'claude-code'
  const base = {
    source: adapterSource(agent),
    occurredAt: context.now.toISOString(),
    ...(context.revision ? { revision: context.revision } : {}),
  }
  const sessionId = payload.session_id
  switch (payload.hook_event_name) {
    case 'SessionStart': {
      const isFresh = payload.source === undefined || FRESH_SESSION_SOURCES.has(payload.source)
      if (!isFresh && context.knownSession) return []
      const task = context.taskId ? { taskId: context.taskId } : {}
      return [{ ...base, type: 'session.started', evidence: 'observed', payload: { sessionId, agent, ...task } }]
    }
    case 'SessionEnd':
      return [{ ...base, type: 'session.ended', evidence: 'observed', payload: { sessionId } }]
    case 'Stop': {
      const note = redactSecrets(payload.last_assistant_message ?? '').trim()
      if (note === '') return []
      return [{ ...base, type: 'session.progress', evidence: 'agent-reported', payload: { sessionId, note: note.slice(0, MAX_NOTE_CHARS) } }]
    }
    case 'UserPromptSubmit':
      return context.prompt ? [{ ...base, type: 'session.prompted', evidence: 'observed', payload: { sessionId, prompt: context.prompt } }] : []
    case 'PostToolUseFailure':
      return context.check ? [checkEvent(base, context.check)] : []
    case 'PostToolUse': {
      if (context.check) return [checkEvent(base, context.check)]
      if (context.sessionTaskId) return [{ ...base, type: 'session.task', evidence: 'observed', payload: { sessionId, taskId: context.sessionTaskId } }]
      return (context.edits ?? []).map((edit) => ({
        ...base,
        type: 'file.changed' as const,
        evidence: 'observed' as const,
        payload: { path: edit.path, contentHash: edit.contentHash, changeType: changeTypeOf(payload, edit), sessionId, ...(context.taskId ? { taskId: context.taskId } : {}) },
      }))
    }
  }
}

/**
 * A prompt as Continuum keeps it: redacted, with pasted blocks (logs, files,
 * credentials) replaced by a marker, and bounded.
 */
export function cleanPrompt(prompt: string): string {
  const withoutPastes = prompt.replace(/<pasted_content id="[^"]*">[\s\S]*?<\/pasted_content id="[^"]*">/g, '[pasted content]')
  return redactSecrets(withoutPastes).trim().slice(0, MAX_PROMPT_CHARS)
}
