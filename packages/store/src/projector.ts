import type { ContentHash, ContinuumEvent, IdentityKey } from '@continuum/core'
import type { EdgeType, UpsertInput } from './graphIndex'
import { hashRecord } from './hash'
import { keys } from './keys'

/** The write operations a projection may perform. ContextStore implements them with write-through persistence. */
export interface Mutations {
  hasNode(key: IdentityKey): boolean
  upsertNode(key: IdentityKey, input: UpsertInput): void
  link(from: IdentityKey, type: EdgeType, to: IdentityKey): void
  putObject(kind: string, value: unknown): ContentHash
}

/** Creates a node only if it does not exist yet, e.g. a task referenced before it was described. */
function ensure(store: Mutations, key: IdentityKey, at: string, hash: ContentHash | null = null): void {
  if (!store.hasNode(key)) store.upsertNode(key, { hash, at })
}

/** Ensures every referenced identity exists, seeding unknown ones with the hash recorded in the event. */
function ensureAnchors(store: Mutations, anchors: Record<IdentityKey, ContentHash>, at: string): IdentityKey[] {
  return Object.entries(anchors).map(([key, hash]) => {
    ensure(store, key, at, hash)
    return key
  })
}

/** Folds one event into the context graph. Pure with respect to its inputs: replaying the log reproduces the graph. */
export function project(store: Mutations, event: ContinuumEvent): void {
  const at = event.occurredAt
  switch (event.type) {
    case 'task.upserted': {
      const { id, ...props } = event.payload
      store.upsertNode(keys.task(id), { hash: hashRecord('task', event.payload), props, at })
      return
    }
    case 'session.started': {
      const { sessionId, agent, taskId } = event.payload
      const session = keys.session(sessionId)
      store.upsertNode(session, { hash: hashRecord('session', event.payload), props: { agent, startedAt: at, taskId }, at })
      if (taskId) {
        ensure(store, keys.task(taskId), at)
        store.link(session, 'worked_on', keys.task(taskId))
      }
      return
    }
    case 'session.ended': {
      const session = keys.session(event.payload.sessionId)
      ensure(store, session, at)
      store.upsertNode(session, { hash: hashRecord('session-end', event.payload), props: { endedAt: at, summary: event.payload.summary }, at })
      return
    }
    case 'file.changed': {
      const { path, contentHash, changeType, additions, deletions, sessionId, taskId } = event.payload
      const file = keys.file(path)
      store.upsertNode(file, { hash: contentHash, props: { path: file.slice('file:'.length), changeType, additions, deletions, revision: event.revision }, at })
      if (sessionId) {
        ensure(store, keys.session(sessionId), at)
        store.link(keys.session(sessionId), 'modified', file)
      }
      if (taskId) {
        ensure(store, keys.task(taskId), at)
        store.link(keys.task(taskId), 'touches', file)
      }
      return
    }
    case 'check.recorded': {
      const check = keys.check(event.payload.name)
      const runHash = store.putObject('check-run', { ...event.payload, ranAt: at, revision: event.revision })
      store.upsertNode(check, {
        hash: runHash,
        props: { name: event.payload.name, command: event.payload.command, exitCode: event.payload.exitCode, lastRunHash: runHash, ranAt: at },
        at,
      })
      for (const covered of ensureAnchors(store, event.payload.ranAgainst, at)) store.link(check, 'ran_against', covered)
      return
    }
    case 'memory.recorded': {
      const { id, taskId, anchors, ...rest } = event.payload
      const memory = keys.memory(id)
      const recordHash = store.putObject('memory', event.payload)
      store.upsertNode(memory, { hash: recordHash, props: { ...rest, anchors, recordHash, evidence: event.evidence }, at })
      for (const anchor of ensureAnchors(store, anchors, at)) store.link(memory, 'anchored_to', anchor)
      if (taskId) {
        ensure(store, keys.task(taskId), at)
        store.link(memory, 'informs', keys.task(taskId))
      }
      return
    }
    default: {
      const unknown: { type?: unknown } = event
      throw new Error(`Unsupported event type "${String(unknown.type)}"`)
    }
  }
}
