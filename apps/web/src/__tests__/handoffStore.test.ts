import { describe, expect, it } from 'vitest'
import { SEED_HANDOFFS } from '../data/mockHandoffs'
import {
  INITIAL_HANDOFF_STATE,
  addHandoff,
  createHandoffRecord,
  isHandoffState,
  selectHandoffs,
  updateHandoffStatus,
} from '../state/handoffStore'
import type { HandoffDraft } from '@continuum/core'

const draft: HandoffDraft = { projectId: 'startup-app', taskId: 'task-google-auth', sourceAgent: 'claude-code', targetAgent: 'codex', includedContext: ['current-task'] }

describe('handoff store', () => {
  it('starts with the seed handoffs, newest first', () => {
    const handoffs = selectHandoffs(INITIAL_HANDOFF_STATE)
    expect(handoffs).toHaveLength(SEED_HANDOFFS.length)
    const times = handoffs.map((h) => Date.parse(h.createdAt))
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('creates new handoffs as drafts without mutating the previous state', () => {
    const record = createHandoffRecord(draft, new Date('2026-01-01T00:00:00Z'))
    const next = addHandoff(INITIAL_HANDOFF_STATE, record)
    expect(record.status).toBe('draft')
    expect(INITIAL_HANDOFF_STATE.created).toHaveLength(0)
    expect(selectHandoffs(next)).toHaveLength(SEED_HANDOFFS.length + 1)
  })

  it('updates the status of created and seed handoffs', () => {
    const record = createHandoffRecord(draft)
    const withRecord = addHandoff(INITIAL_HANDOFF_STATE, record)
    const prepared = updateHandoffStatus(withRecord, record.id, 'prepared')
    const seedCopied = updateHandoffStatus(prepared, 'h-ingest', 'copied')
    const byId = Object.fromEntries(selectHandoffs(seedCopied).map((h) => [h.id, h.status]))
    expect(byId[record.id]).toBe('prepared')
    expect(byId['h-ingest']).toBe('copied')
  })

  it('ignores unknown ids', () => {
    expect(updateHandoffStatus(INITIAL_HANDOFF_STATE, 'missing', 'copied')).toBe(INITIAL_HANDOFF_STATE)
  })

  it('hides seeds once history is cleared', () => {
    expect(selectHandoffs({ seedsCleared: true, seedStatus: {}, created: [] })).toHaveLength(0)
  })

  it('validates persisted state', () => {
    expect(isHandoffState(INITIAL_HANDOFF_STATE)).toBe(true)
    expect(isHandoffState({ seedsCleared: 'no' })).toBe(false)
    expect(isHandoffState({ seedsCleared: false, seedStatus: { a: 'bogus' }, created: [] })).toBe(false)
    expect(isHandoffState({ seedsCleared: false, seedStatus: {}, created: [{ id: 1 }] })).toBe(false)
  })
})
