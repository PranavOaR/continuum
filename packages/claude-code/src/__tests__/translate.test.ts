import { describe, expect, it } from 'vitest'
import { editedPath, InvalidHookPayloadError, parseHookPayload, type HookPayload } from '../hookPayload'
import { translateHook, type TranslateContext } from '../translate'

const NOW = new Date('2026-10-16T12:00:00.000Z')
const common = { session_id: 'sess-1', cwd: '/work/app', transcript_path: '/x.jsonl', permission_mode: 'default' }

function payload(fields: Record<string, unknown>): HookPayload {
  const parsed = parseHookPayload(JSON.stringify({ ...common, ...fields }))
  if (!parsed) throw new Error('unexpectedly ignored')
  return parsed
}

const context = (extra: Partial<TranslateContext> = {}): TranslateContext => ({ now: NOW, revision: 'a3f9c21', knownSession: false, ...extra })

describe('parseHookPayload', () => {
  it('accepts the documented payloads and keeps unknown fields', () => {
    const parsed = payload({ hook_event_name: 'SessionStart', source: 'startup', model: 'claude-opus-5-5' })
    expect(parsed).toMatchObject({ hook_event_name: 'SessionStart', source: 'startup', model: 'claude-opus-5-5' })
  })

  it('ignores hook events Continuum does not handle', () => {
    expect(parseHookPayload(JSON.stringify({ ...common, hook_event_name: 'PreCompact' }))).toBeNull()
  })

  it('rejects malformed input with a precise reason', () => {
    expect(() => parseHookPayload('not json')).toThrow(InvalidHookPayloadError)
    expect(() => parseHookPayload(JSON.stringify({ hook_event_name: 'Stop', cwd: '/x' }))).toThrow(/session_id/)
    expect(() => parseHookPayload(JSON.stringify({ ...common, hook_event_name: 'PostToolUse', tool_name: 'Write' }))).toThrow(/tool_input/)
    expect(() => parseHookPayload('[]')).toThrow(InvalidHookPayloadError)
  })
})

describe('editedPath', () => {
  it('reads the path each file-editing tool writes', () => {
    expect(editedPath(payload({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: '/work/app/a.ts', content: 'x' } }))).toBe('/work/app/a.ts')
    expect(editedPath(payload({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: '/work/app/b.ts' } }))).toBe('/work/app/b.ts')
    expect(editedPath(payload({ hook_event_name: 'PostToolUse', tool_name: 'NotebookEdit', tool_input: { notebook_path: '/work/app/n.ipynb' } }))).toBe('/work/app/n.ipynb')
  })

  it('ignores tools that do not edit files', () => {
    expect(editedPath(payload({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'rm a.ts' } }))).toBeNull()
    expect(editedPath(payload({ hook_event_name: 'Stop' }))).toBeNull()
  })
})

describe('translateHook', () => {
  it('starts a session on startup, clear and fork', () => {
    for (const source of ['startup', 'clear', 'fork']) {
      expect(translateHook(payload({ hook_event_name: 'SessionStart', source }), context({ knownSession: true }))).toEqual([
        { type: 'session.started', evidence: 'observed', source: 'adapter:claude-code', occurredAt: NOW.toISOString(), revision: 'a3f9c21', payload: { sessionId: 'sess-1', agent: 'claude-code' } },
      ])
    }
  })

  it('does not restart a known session on resume or compact, but records an unknown one', () => {
    expect(translateHook(payload({ hook_event_name: 'SessionStart', source: 'resume' }), context({ knownSession: true }))).toEqual([])
    expect(translateHook(payload({ hook_event_name: 'SessionStart', source: 'compact' }), context({ knownSession: true }))).toEqual([])
    expect(translateHook(payload({ hook_event_name: 'SessionStart', source: 'resume' }), context())).toHaveLength(1)
  })

  it('ends sessions', () => {
    expect(translateHook(payload({ hook_event_name: 'SessionEnd', reason: 'prompt_input_exit' }), context({ revision: null }))).toEqual([
      { type: 'session.ended', evidence: 'observed', source: 'adapter:claude-code', occurredAt: NOW.toISOString(), payload: { sessionId: 'sess-1' } },
    ])
  })

  it("keeps Claude's last message as an agent-reported, redacted, bounded note", () => {
    const secret = ['not', 'real', 'value'].join('-')
    const [event] = translateHook(payload({ hook_event_name: 'Stop', last_assistant_message: `Done. Set API_KEY=${secret}. ${'x'.repeat(5000)}` }), context())
    expect(event).toMatchObject({ type: 'session.progress', evidence: 'agent-reported' })
    const note = event.type === 'session.progress' ? event.payload.note : ''
    expect(note).toContain('API_KEY=[redacted]')
    expect(note.length).toBe(2000)
    expect(translateHook(payload({ hook_event_name: 'Stop', last_assistant_message: '   ' }), context())).toEqual([])
  })

  it('attributes sessions and edits to the current task', () => {
    const [started] = translateHook(payload({ hook_event_name: 'SessionStart', source: 'startup' }), context({ taskId: 'oauth' }))
    expect(started).toMatchObject({ payload: { taskId: 'oauth' } })
    const edit = payload({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: '/work/app/a.ts' } })
    expect(translateHook(edit, context({ taskId: 'oauth', edits: [{ path: 'a.ts', contentHash: 'h' }] }))[0]).toMatchObject({ payload: { taskId: 'oauth', sessionId: 'sess-1' } })
  })

  it('attributes file edits to the session', () => {
    const write = payload({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: '/work/app/src/a.ts' }, tool_response: { type: 'create' } })
    expect(translateHook(write, context({ edits: [{ path: 'src/a.ts', contentHash: 'h1' }] }))[0]).toMatchObject({
      type: 'file.changed',
      evidence: 'observed',
      payload: { path: 'src/a.ts', contentHash: 'h1', changeType: 'added', sessionId: 'sess-1' },
    })
    const edit = payload({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: '/work/app/src/a.ts' } })
    expect(translateHook(edit, context({ edits: [{ path: 'src/a.ts', contentHash: 'h2' }] }))[0]).toMatchObject({ payload: { changeType: 'modified' } })
    expect(translateHook(edit, context({ edits: [{ path: 'src/a.ts', contentHash: null }] }))[0]).toMatchObject({ payload: { changeType: 'deleted' } })
    expect(translateHook(edit, context())).toEqual([])
  })
})
