import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CONTINUUM_DIR, hashFiles, loadContinuumIgnore, readSymbolHashes } from '@continuum/capture'
import { recallAnchors, recalledIds, recallFor, renderRecall } from '@continuum/context'
import type { ContentHash, IdentityKey } from '@continuum/core'
import { anchoredPath, type ContextStore } from '@continuum/store'

/** What each recent session was already reminded of, so a record is recalled once per session. */
const RECALLED_FILE = 'recalled.json'
const KEPT_SESSIONS = 20
const FILE_PREFIX = 'file:'
const SYMBOL_PREFIX = 'symbol:'

type Recalled = Record<string, string[]>

const recalledPath = (root: string) => join(root, CONTINUUM_DIR, RECALLED_FILE)

async function readRecalled(root: string): Promise<Recalled> {
  if (!existsSync(recalledPath(root))) return {}
  try {
    const parsed: unknown = JSON.parse(await readFile(recalledPath(root), 'utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Recalled) : {}
  } catch {
    return {}
  }
}

async function rememberRecalled(root: string, sessionId: string, ids: readonly string[]): Promise<void> {
  const previous = await readRecalled(root)
  const { [sessionId]: earlier = [], ...others } = previous
  // The most recent sessions are kept; the file never grows past a few kilobytes.
  const kept = Object.entries(others).slice(-(KEPT_SESSIONS - 1))
  const next = Object.fromEntries([...kept, [sessionId, [...new Set([...earlier, ...ids])]]])
  const temporary = `${recalledPath(root)}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600 })
  await rename(temporary, recalledPath(root))
}

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
  const exclude = new Set((await readRecalled(root))[sessionId] ?? [])
  const isIgnored = await loadContinuumIgnore(root)
  const visible = (anchor: string) => !isIgnored((anchor.split('#')[0] ?? anchor))
  const anchors = recallAnchors(store, prompt, { exclude }).filter((key) => !isIgnored(anchoredPath(key) ?? ''))
  const recalled = recallFor(store, prompt, await liveHashes(root, anchors), { exclude }).map((item) => ({
    ...item,
    anchors: item.anchors.filter(visible),
    changed: item.changed.filter(visible),
  }))
  if (recalled.length === 0) return undefined
  await rememberRecalled(root, sessionId, recalledIds(recalled))
  return redact(renderRecall(recalled))
}
