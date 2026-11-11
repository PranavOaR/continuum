import { keys, type ContextStore } from '@continuum/store'
import { addSessionMarks, sessionMarks } from './sessionMarks'

/**
 * End-of-session reflection, which you turn on: once in a session that changed
 * files, its first Stop asks Claude Code to record the decisions and dead ends
 * it made before it finishes. The agent already holds the conversation, so
 * Continuum needs no model of its own. Off by default, because it is the one
 * hook that makes an agent go on.
 */
const REFLECTED_FILE = 'reflected.json'
const ASKED = 'asked'
const MAX_NAMED_FILES = 5
const FILE_PREFIX = 'file:'

export async function reflectionRequest(store: ContextStore, root: string, sessionId: string): Promise<string | undefined> {
  const session = keys.session(sessionId)
  if (!store.graph.has(session)) return undefined
  const files = store.graph.neighbors(session, { direction: 'out', types: ['modified'] }).map((key) => key.slice(FILE_PREFIX.length)).sort()
  if (files.length === 0 || (await sessionMarks(root, REFLECTED_FILE, sessionId)).has(ASKED)) return undefined
  await addSessionMarks(root, REFLECTED_FILE, sessionId, [ASKED])
  const named = files.slice(0, MAX_NAMED_FILES).map((file) => `\`${file}\``).join(', ')
  const more = files.length > MAX_NAMED_FILES ? ` and ${files.length - MAX_NAMED_FILES} more` : ''
  return [
    `Before you finish: this session changed ${named}${more}.`,
    'If you made a decision the next session should follow, or tried something that did not work, record each one with the continuum tool record_decision (kind decision, known-issue or previous-attempt), anchored to the files or to path#symbol.',
    'If there is nothing worth recording, just finish. Continuum asks this once per session.',
  ].join(' ')
}
