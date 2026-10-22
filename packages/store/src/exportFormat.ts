// Validates `continuum import` files: an export is untrusted input until it passes.
import { EVIDENCE_LABEL } from '@continuum/core'
import { EXPORT_FORMAT, EXPORT_VERSION, type FirstEvent, type GraphState, type HistoryExport } from './checkpoint'

/** Every evidence type an event may carry. A hand-kept list here once missed user-reported, so dashboard edits could not be imported. */
const EVIDENCE = new Set(Object.keys(EVIDENCE_LABEL))
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function isExportedEvent(entry: unknown): entry is FirstEvent {
  if (!isRecord(entry) || !Number.isSafeInteger(entry.seq) || (entry.seq as number) < 1 || !isRecord(entry.event)) return false
  const { type, payload, evidence, source, occurredAt } = entry.event
  return typeof type === 'string' && isRecord(payload) && typeof evidence === 'string' && EVIDENCE.has(evidence) && typeof source === 'string' && typeof occurredAt === 'string'
}

function isGraphState(state: unknown): state is GraphState {
  if (!isRecord(state) || !Array.isArray(state.nodes) || !Array.isArray(state.edges)) return false
  const nodesOk = state.nodes.every(
    (node) => isRecord(node) && typeof node.key === 'string' && typeof node.kind === 'string' && Array.isArray(node.history) && isRecord(node.props) && typeof node.updatedAt === 'string',
  )
  return nodesOk && state.edges.every((edge) => isRecord(edge) && typeof edge.from === 'string' && typeof edge.type === 'string' && typeof edge.to === 'string')
}

/** Rejects anything that is not a well-formed export, before any of it is written. */
export function assertValidExport(history: unknown): asserts history is HistoryExport {
  const invalid = (reason: string) => new Error(`This file is not a valid Continuum history export: ${reason}.`)
  if (!isRecord(history) || history.format !== EXPORT_FORMAT) throw invalid('unknown format')
  if (history.version !== EXPORT_VERSION) throw invalid(`version ${String(history.version)} is not supported`)
  if (!Array.isArray(history.events) || !history.events.every(isExportedEvent)) throw invalid('malformed events')
  const checkpoint = history.checkpoint
  if (checkpoint !== null) {
    if (!isRecord(checkpoint) || !Number.isSafeInteger(checkpoint.seq) || typeof checkpoint.createdAt !== 'string') throw invalid('malformed checkpoint')
    if (!isGraphState(checkpoint.state) || !Array.isArray(checkpoint.firstEvents) || !checkpoint.firstEvents.every(isExportedEvent)) throw invalid('malformed checkpoint')
  }
  let previous = checkpoint === null ? 0 : (checkpoint.seq as number)
  for (const { seq } of history.events) {
    if (seq <= previous) throw invalid('event sequence numbers must increase and follow the checkpoint')
    previous = seq
  }
}
