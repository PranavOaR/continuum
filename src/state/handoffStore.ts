import { SEED_HANDOFFS } from '../data/mockHandoffs'
import { isRecord } from '../services/storage'
import type { Handoff, HandoffDraft, HandoffStatus } from '../types'

/**
 * Persisted handoff state. Seed records are kept in code (so their timestamps stay
 * anchored to the demo clock) and only their status overrides are stored.
 */
export interface HandoffState {
  seedsCleared: boolean
  seedStatus: Record<string, HandoffStatus>
  created: Handoff[]
}

export const INITIAL_HANDOFF_STATE: HandoffState = { seedsCleared: false, seedStatus: {}, created: [] }

const STATUSES = new Set<string>(['draft', 'prepared', 'copied'])

function isHandoff(value: unknown): value is Handoff {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.projectId === 'string' &&
    typeof value.taskId === 'string' &&
    typeof value.sourceAgent === 'string' &&
    typeof value.targetAgent === 'string' &&
    typeof value.status === 'string' &&
    STATUSES.has(value.status) &&
    Array.isArray(value.includedContext) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

export function isHandoffState(value: unknown): value is HandoffState {
  return (
    isRecord(value) &&
    typeof value.seedsCleared === 'boolean' &&
    isRecord(value.seedStatus) &&
    Object.values(value.seedStatus).every((status) => typeof status === 'string' && STATUSES.has(status)) &&
    Array.isArray(value.created) &&
    value.created.every(isHandoff)
  )
}

export function selectHandoffs(state: HandoffState): Handoff[] {
  const seeds = state.seedsCleared
    ? []
    : SEED_HANDOFFS.map((seed) => {
        const status = state.seedStatus[seed.id]
        return status ? { ...seed, status } : seed
      })
  return [...state.created, ...seeds].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export function createHandoffRecord(draft: HandoffDraft, now: Date = new Date()): Handoff {
  const timestamp = now.toISOString()
  return {
    ...draft,
    includedContext: [...draft.includedContext],
    id: `h-${now.getTime().toString(36)}`,
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function addHandoff(state: HandoffState, handoff: Handoff): HandoffState {
  return { ...state, created: [handoff, ...state.created] }
}

export function updateHandoffStatus(state: HandoffState, id: string, status: HandoffStatus, now: Date = new Date()): HandoffState {
  if (state.created.some((handoff) => handoff.id === id)) {
    return {
      ...state,
      created: state.created.map((handoff) => (handoff.id === id ? { ...handoff, status, updatedAt: now.toISOString() } : handoff)),
    }
  }
  if (SEED_HANDOFFS.some((seed) => seed.id === id)) {
    return { ...state, seedStatus: { ...state.seedStatus, [id]: status } }
  }
  return state
}
