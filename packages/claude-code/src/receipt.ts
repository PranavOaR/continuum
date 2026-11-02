import type { ContinuumEvent } from '@continuum/core'
import type { ContextStore } from '@continuum/store'

/** How far back a receipt looks for the start of the reply; a reply never records more than this. */
const MAX_REPLY_EVENTS = 1_000
/** Checks named one by one; beyond this they are counted. */
const MAX_NAMED_CHECKS = 3

/**
 * Everything recorded since this session's previous reply ended (its last
 * progress note) or, for its first reply, since it started. Newest first.
 */
function replyEvents(store: ContextStore, sessionId: string): ContinuumEvent[] {
  const events: ContinuumEvent[] = []
  for (const { event } of store.recentEvents(MAX_REPLY_EVENTS)) {
    const isBoundary = (event.type === 'session.progress' || event.type === 'session.started') && event.payload.sessionId === sessionId
    if (isBoundary) break
    events.push(event)
  }
  return events
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
const inlineCode = (text: string) => `\`${text.replaceAll('`', "'")}\``

function joined(parts: readonly string[]): string {
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/**
 * One line for the person, after a reply: the files this session edited and
 * the checks its own hooks recorded since its previous reply. Decisions carry no
 * session, so they are left out rather than credited to the wrong agent.
 * Undefined when the reply recorded nothing.
 */
export function replyReceipt(store: ContextStore, sessionId: string, checkSource: string): string | undefined {
  const events = replyEvents(store, sessionId)
  const files = new Set(events.flatMap((event) => (event.type === 'file.changed' && event.payload.sessionId === sessionId ? [event.payload.path] : [])))
  // Newest first, so the first run of each check is its latest result.
  const checks = new Map<string, number>()
  for (const event of events) {
    if (event.type === 'check.recorded' && event.source === checkSource && !checks.has(event.payload.name)) checks.set(event.payload.name, event.payload.exitCode)
  }
  const named = [...checks].reverse().map(([name, exitCode]) => `${inlineCode(name)} (${exitCode === 0 ? 'passed' : 'failed'})`)
  const checkParts = named.length > MAX_NAMED_CHECKS ? [plural(named.length, 'check run')] : named
  const parts = [...(files.size > 0 ? [plural(files.size, 'file edit')] : []), ...checkParts]
  return parts.length === 0 ? undefined : `Continuum recorded ${joined(parts)} for the next session.`
}
