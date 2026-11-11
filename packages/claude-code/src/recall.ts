import { hashFiles, loadContinuumIgnore, readSymbolHashes } from '@continuum/capture'
import { recallAnchors, recalledIds, recallFor, renderRecall } from '@continuum/context'
import type { ContentHash, IdentityKey } from '@continuum/core'
import { anchoredPath, type ContextStore } from '@continuum/store'
import { addSessionMarks, sessionMarks } from './sessionMarks'

/** What each recent session was already reminded of, so a record is recalled once per session. */
const RECALLED_FILE = 'recalled.json'
const FILE_PREFIX = 'file:'
const SYMBOL_PREFIX = 'symbol:'

/** Current hashes of just these anchors: files from git, symbols from their source. */
async function liveHashes(root: string, anchors: readonly IdentityKey[]): Promise<Map<IdentityKey, ContentHash>> {
  const files = anchors.filter((key) => key.startsWith(FILE_PREFIX)).map((key) => key.slice(FILE_PREFIX.length))
  const [fileHashes, symbolHashes] = await Promise.all([hashFiles(root, files), readSymbolHashes(root, anchors.filter((key) => key.startsWith(SYMBOL_PREFIX)))])
  return new Map<IdentityKey, ContentHash>([...[...fileHashes].map(([path, hash]) => [`${FILE_PREFIX}${path}`, hash] as const), ...symbolHashes])
}

/**
 * The recall to add to a prompt, masked by the repository's rules and with
 * nothing .continuumignore lists; undefined when nothing matches well enough.
 */
export async function recallForPrompt(store: ContextStore, root: string, sessionId: string, prompt: string, redact: (text: string) => string): Promise<string | undefined> {
  const exclude = await sessionMarks(root, RECALLED_FILE, sessionId)
  const isIgnored = await loadContinuumIgnore(root)
  const visible = (anchor: string) => !isIgnored((anchor.split('#')[0] ?? anchor))
  const anchors = recallAnchors(store, prompt, { exclude }).filter((key) => !isIgnored(anchoredPath(key) ?? ''))
  const recalled = recallFor(store, prompt, await liveHashes(root, anchors), { exclude }).map((item) => ({
    ...item,
    anchors: item.anchors.filter(visible),
    changed: item.changed.filter(visible),
  }))
  if (recalled.length === 0) return undefined
  await addSessionMarks(root, RECALLED_FILE, sessionId, recalledIds(recalled))
  return redact(renderRecall(recalled))
}
