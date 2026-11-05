import { randomUUID } from 'node:crypto'
import { MAX_MEMORY_BODY_CHARS, MAX_TITLE_CHARS, type CurrentHashes, type IdentityKey, type ContentHash, type MemoryKind, type MemoryRecordedEvent, type MemoryReview, type NewMemory } from '@continuum/core'
import type { ContextStore, GraphNode } from '@continuum/store'

const ADDABLE: ReadonlySet<string> = new Set(['decision', 'known-issue'])

export class InvalidMemoryError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'InvalidMemoryError'
  }
}

type MemoryPayload = MemoryRecordedEvent['payload']

/** A decision or known issue typed in the dashboard. It anchors to no code, so it can never be flagged as stale. */
export function newMemory(input: NewMemory): MemoryPayload {
  if (!ADDABLE.has(input.kind)) throw new InvalidMemoryError(`Cannot add a record of kind "${String(input.kind)}".`)
  // One line: a title is quoted into briefings, and a line break there could pose as a heading.
  const title = input.title.replace(/\s+/g, ' ').trim()
  if (title === '') throw new InvalidMemoryError('A record needs a title.')
  if (title.length > MAX_TITLE_CHARS) throw new InvalidMemoryError(`The title is longer than ${MAX_TITLE_CHARS} characters.`)
  const body = input.body?.trim() ?? ''
  if (body.length > MAX_MEMORY_BODY_CHARS) throw new InvalidMemoryError(`The text is longer than ${MAX_MEMORY_BODY_CHARS} characters.`)
  return { id: randomUUID(), kind: input.kind, title, body, anchors: {}, ...(input.taskId ? { taskId: input.taskId } : {}) }
}

export const isResolved = (node: GraphNode) => node.props.review === 'resolved'

/**
 * The record again, with your verdict. Saying it still holds re-anchors it to the
 * code as it is now, so it is flagged the next time that code changes. An anchor
 * whose file or symbol has gone is dropped: there is nothing left to watch.
 */
export function reviewedMemory(store: ContextStore, node: GraphNode, review: MemoryReview, current: CurrentHashes): MemoryPayload {
  const anchors = (node.props.anchors ?? {}) as Record<IdentityKey, ContentHash>
  const [taskKey] = store.graph.neighbors(node.key, { direction: 'out', types: ['informs'] })
  return {
    id: node.key.slice('memory:'.length),
    kind: node.props.kind as MemoryKind,
    title: String(node.props.title),
    body: String(node.props.body ?? ''),
    anchors: review === 'still-valid' ? Object.fromEntries(Object.keys(anchors).flatMap((key) => (current.has(key) ? [[key, current.get(key) as ContentHash]] : []))) : anchors,
    review,
    ...(taskKey ? { taskId: taskKey.slice('task:'.length) } : {}),
  }
}
