import { existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MAX_MEMORY_BODY_CHARS, MAX_TITLE_CHARS, SHARE_SOURCE, SHARED_SOURCE, type ContentHash, type IdentityKey, type MemoryKind, type MemoryRecordedEvent, type MemoryReview } from '@continuum/core'
import { hashRecord, keys, type ContextStore, type GraphNode } from '@continuum/store'

/**
 * Decisions shared through git: an opt-in file at the repository root that a
 * team commits and reviews like code. Everything else Continuum records stays
 * in this clone's .continuum/ store. Each clone imports the file when it scans.
 */
export const SHARED_FILE = '.continuum-decisions.json'
export { SHARE_SOURCE, SHARED_SOURCE }

const VERSION = 1
const SHAREABLE_KINDS: ReadonlySet<string> = new Set<MemoryKind>(['decision', 'known-issue', 'previous-attempt'])
/** A shared file can be edited by anyone with commit access: it never carries Continuum's own evidence. */
const SHAREABLE_EVIDENCE = new Set(['agent-reported', 'user-reported'])
const REVIEWS: ReadonlySet<string> = new Set<MemoryReview>(['resolved', 'still-valid'])
const MAX_RECORDS = 1_000
const MAX_ANCHORS = 50
const MAX_ID_CHARS = 100
const MAX_PATH_CHARS = 500
const MAX_FILE_BYTES = 2 * 1024 * 1024
const HASH = /^[0-9a-f]{64}$/
/** Record ids become store keys and are printed: letters, digits, dot, dash and underscore only (UUIDs fit). */
const ID = /^[A-Za-z0-9._-]+$/
const ANCHOR = /^(file|symbol):(.+)$/

export type SharedEvidence = 'agent-reported' | 'user-reported'

export interface SharedRecord {
  id: string
  kind: MemoryKind
  title: string
  body: string
  anchors: Record<IdentityKey, ContentHash>
  evidence: SharedEvidence
  recordedAt: string
  review?: MemoryReview
}

export class SharedFileError extends Error {
  constructor(reason: string) {
    super(`${SHARED_FILE} ${reason}`)
    this.name = 'SharedFileError'
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A repository-relative path that stays inside the repository: no absolute paths, drive letters, `..` or backslashes. */
function isSafePath(path: string): boolean {
  if (path === '' || path.length > MAX_PATH_CHARS || path.startsWith('/') || path.includes('\\') || /^[A-Za-z]:/.test(path)) return false
  return path.split('/').every((segment) => segment !== '' && segment !== '..' && segment !== '.')
}

function parseAnchors(value: unknown): Record<IdentityKey, ContentHash> | null {
  if (!isObject(value)) return null
  const entries = Object.entries(value)
  if (entries.length > MAX_ANCHORS) return null
  for (const [key, hash] of entries) {
    const match = ANCHOR.exec(key)
    if (!match || typeof hash !== 'string' || !HASH.test(hash)) return null
    const path = match[1] === 'symbol' ? match[2].slice(0, match[2].lastIndexOf('#')) : match[2]
    if ((match[1] === 'symbol' && !match[2].includes('#')) || !isSafePath(path)) return null
  }
  return Object.fromEntries(entries) as Record<IdentityKey, ContentHash>
}

/** One record as the file holds it, or null when it cannot be trusted as written. */
function parseRecord(value: unknown): SharedRecord | null {
  if (!isObject(value)) return null
  const { id, kind, title, body, anchors, evidence, recordedAt, review } = value
  if (typeof id !== 'string' || !ID.test(id) || id.length > MAX_ID_CHARS) return null
  if (typeof kind !== 'string' || !SHAREABLE_KINDS.has(kind)) return null
  if (typeof title !== 'string' || title.trim() === '' || title.length > MAX_TITLE_CHARS) return null
  if (typeof body !== 'string' || body.length > MAX_MEMORY_BODY_CHARS) return null
  if (typeof recordedAt !== 'string' || Number.isNaN(Date.parse(recordedAt))) return null
  if (review !== undefined && (typeof review !== 'string' || !REVIEWS.has(review))) return null
  const parsedAnchors = parseAnchors(anchors)
  if (!parsedAnchors) return null
  return {
    id,
    kind: kind as MemoryKind,
    // One line: titles are quoted into briefings, where a line break could pose as a heading.
    title: title.replace(/\s+/g, ' ').trim(),
    body,
    anchors: parsedAnchors,
    evidence: typeof evidence === 'string' && SHAREABLE_EVIDENCE.has(evidence) ? (evidence as SharedEvidence) : 'agent-reported',
    recordedAt,
    ...(review ? { review: review as MemoryReview } : {}),
  }
}

/** The records in a shared file's text; records that fail validation are skipped and counted. */
export function parseSharedFile(text: string): { records: SharedRecord[]; skipped: number } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new SharedFileError('is not valid JSON. Fix it or check it out again from git.')
  }
  if (!isObject(parsed) || !Array.isArray(parsed.records)) throw new SharedFileError('has no "records" list.')
  if (parsed.version !== VERSION) throw new SharedFileError(`is version ${String(parsed.version)}; this Continuum reads version ${VERSION}. Update Continuum.`)
  const candidates = parsed.records.slice(0, MAX_RECORDS)
  const records = candidates.map(parseRecord).filter((shared): shared is SharedRecord => shared !== null)
  return { records, skipped: parsed.records.length - records.length }
}

/** The file's text for these records: id order and stable formatting, so a change reviews as a small diff. */
export function sharedFileContent(records: readonly SharedRecord[]): string {
  const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id))
  return `${JSON.stringify({ version: VERSION, records: sorted }, null, 2)}\n`
}

export async function readSharedRecords(root: string): Promise<{ records: SharedRecord[]; skipped: number }> {
  const path = join(root, SHARED_FILE)
  if (!existsSync(path)) return { records: [], skipped: 0 }
  if ((await stat(path)).size > MAX_FILE_BYTES) throw new SharedFileError(`is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
  return parseSharedFile(await readFile(path, 'utf8'))
}

export async function writeSharedRecords(root: string, records: readonly SharedRecord[]): Promise<void> {
  await writeFile(join(root, SHARED_FILE), sharedFileContent(records))
}

/** Identifies one version of a shared record, so a clone knows whether the file changed since it last read it. */
export function sharedHashOf(record: SharedRecord): ContentHash {
  return hashRecord('shared-memory', record)
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** What a teammate needs from a stored record, or null for kinds that are not shared. The task stays local. */
export function sharedRecordOf(node: GraphNode): SharedRecord | null {
  const kind = text(node.props.kind)
  if (node.kind !== 'memory' || !SHAREABLE_KINDS.has(kind)) return null
  const evidence = text(node.props.evidence)
  const review = text(node.props.review)
  return {
    id: node.key.slice('memory:'.length),
    kind: kind as MemoryKind,
    title: text(node.props.title),
    body: text(node.props.body),
    anchors: (node.props.anchors ?? {}) as Record<IdentityKey, ContentHash>,
    evidence: SHAREABLE_EVIDENCE.has(evidence) ? (evidence as SharedEvidence) : 'agent-reported',
    recordedAt: text(node.props.recordedAt) || node.updatedAt,
    ...(REVIEWS.has(review) ? { review: review as MemoryReview } : {}),
  }
}

/**
 * The events that bring the shared file into this clone, each labelled agent-reported
 * whatever the file says (the briefing adds that it is shared). A record is taken when
 * the clone has never seen it, or when it came from the file and the file now
 * holds a newer version. A record of this clone's own that the file does not
 * account for is never overwritten.
 */
export function importSharedEvents(store: ContextStore, records: readonly SharedRecord[], redact: (text: string) => string, occurredAt: string): MemoryRecordedEvent[] {
  return records.flatMap((shared) => {
    const hash = sharedHashOf(shared)
    const node = store.graph.get(keys.memory(shared.id))
    const held = node?.props.sharedHash
    if (node && (held === undefined || held === hash)) return []
    const event: MemoryRecordedEvent = {
      type: 'memory.recorded',
      payload: {
        id: shared.id,
        kind: shared.kind,
        title: redact(shared.title),
        body: redact(shared.body),
        anchors: shared.anchors,
        sharedHash: hash,
        ...(shared.review ? { review: shared.review } : {}),
      },
      // Whoever wrote it, it is not "set by you" in this clone, and the file proves nothing: it reads as reported, not proof.
      evidence: 'agent-reported',
      source: SHARED_SOURCE,
      occurredAt,
    }
    return [event]
  })
}

/**
 * Marks a local record as the version now in the shared file. Its text, label and
 * date stay as they were; its task link stays too, since the projector only adds links.
 */
export function shareEvent(node: GraphNode, shared: SharedRecord, occurredAt: string): MemoryRecordedEvent {
  return {
    type: 'memory.recorded',
    payload: {
      id: shared.id,
      kind: shared.kind,
      title: text(node.props.title),
      body: text(node.props.body),
      anchors: shared.anchors,
      sharedHash: sharedHashOf(shared),
      ...(shared.review ? { review: shared.review } : {}),
    },
    evidence: shared.evidence,
    source: SHARE_SOURCE,
    occurredAt,
  }
}
