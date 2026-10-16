import { redactSecrets } from '@continuum/capture'
import type { ChangeType, ContentHash, ContinuumEvent } from '@continuum/core'
import type { HookPayload } from './hookPayload'

export const ADAPTER_SOURCE = 'adapter:claude-code'
/** Longest agent note kept per turn; the handoff quotes far less. */
export const MAX_NOTE_CHARS = 2_000
const FRESH_SESSION_SOURCES = new Set(['startup', 'clear', 'fork'])

export interface FileEdit {
  /** Repository-relative path. */
  path: string
  /** Blob hash after the edit, or null if the file no longer exists. */
  contentHash: ContentHash | null
}

export interface TranslateContext {
  now: Date
  revision: string | null
  /** Whether the store already knows this session (resume and compact reuse the id). */
  knownSession: boolean
  /** Set when the payload is a file edit inside the repository that scans capture. */
  edit?: FileEdit
  /** The task currently being worked on, if one is recorded. */
  taskId?: string
}

function changeTypeOf(payload: Extract<HookPayload, { hook_event_name: 'PostToolUse' }>, edit: FileEdit): ChangeType {
  if (edit.contentHash === null) return 'deleted'
  const response = payload.tool_response as { type?: unknown } | undefined
  return payload.tool_name === 'Write' && response?.type === 'create' ? 'added' : 'modified'
}

/** Pure mapping from one Claude Code hook payload to the events it implies. */
export function translateHook(payload: HookPayload, context: TranslateContext): ContinuumEvent[] {
  const base = {
    source: ADAPTER_SOURCE,
    occurredAt: context.now.toISOString(),
    ...(context.revision ? { revision: context.revision } : {}),
  }
  const sessionId = payload.session_id
  switch (payload.hook_event_name) {
    case 'SessionStart': {
      const isFresh = payload.source === undefined || FRESH_SESSION_SOURCES.has(payload.source)
      if (!isFresh && context.knownSession) return []
      const task = context.taskId ? { taskId: context.taskId } : {}
      return [{ ...base, type: 'session.started', evidence: 'observed', payload: { sessionId, agent: 'claude-code', ...task } }]
    }
    case 'SessionEnd':
      return [{ ...base, type: 'session.ended', evidence: 'observed', payload: { sessionId } }]
    case 'Stop': {
      const note = redactSecrets(payload.last_assistant_message ?? '').trim()
      if (note === '') return []
      return [{ ...base, type: 'session.progress', evidence: 'agent-reported', payload: { sessionId, note: note.slice(0, MAX_NOTE_CHARS) } }]
    }
    case 'PostToolUse': {
      const { edit } = context
      if (!edit) return []
      return [
        {
          ...base,
          type: 'file.changed',
          evidence: 'observed',
          payload: { path: edit.path, contentHash: edit.contentHash, changeType: changeTypeOf(payload, edit), sessionId, ...(context.taskId ? { taskId: context.taskId } : {}) },
        },
      ]
    }
  }
}
