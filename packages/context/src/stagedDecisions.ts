import type { StagedChanges } from '@continuum/capture'
import { evidenceTag, type ContentHash, type EvidenceType, type IdentityKey, type MemoryKind } from '@continuum/core'
import { anchoredPath, type ContextStore, type GraphNode } from '@continuum/store'

/** A recorded decision whose anchored code the staged changes alter. */
export interface TouchedDecision {
  id: string
  kind: MemoryKind
  title: string
  body: string
  evidence: EvidenceType
  /** The anchors the commit changes: `src/a.ts`, or `src/a.ts#login`. */
  changed: string[]
}

const SYMBOL_PREFIX = 'symbol:'
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const label = (key: IdentityKey) => (key.startsWith(SYMBOL_PREFIX) ? key.slice(SYMBOL_PREFIX.length) : (anchoredPath(key) ?? key))

/**
 * The decisions a commit is about to change the ground under: those anchored
 * to a staged path whose staged content is no longer what the decision was
 * recorded against. A symbol anchor ignores staged edits elsewhere in its
 * file. Records you resolved, and paths `isIgnored` covers, are left out.
 */
export function decisionsTouchedByStaged(store: ContextStore, staged: StagedChanges, isIgnored: (path: string) => boolean = () => false): TouchedDecision[] {
  const paths = new Set(staged.paths.filter((path) => !isIgnored(path)))
  const isUnchanged = (key: IdentityKey, hash: ContentHash) =>
    key.startsWith(SYMBOL_PREFIX) ? (staged.symbols.get(key) ?? []).includes(hash) : staged.files.get(anchoredPath(key) ?? '') === hash
  return store.graph
    .keysOfKind('memory')
    .map((key) => store.graph.get(key) as GraphNode)
    .filter((node) => node.props.review !== 'resolved')
    .flatMap((node): TouchedDecision[] => {
      const anchors = Object.entries((node.props.anchors ?? {}) as Record<IdentityKey, ContentHash>)
      const changed = anchors.filter(([key, hash]) => paths.has(anchoredPath(key) ?? '') && !isUnchanged(key, hash)).map(([key]) => label(key))
      if (changed.length === 0) return []
      return [{ id: node.key.slice('memory:'.length), kind: (text(node.props.kind) || 'decision') as MemoryKind, title: text(node.props.title) || '(untitled)', body: text(node.props.body), evidence: (text(node.props.evidence) || 'agent-reported') as EvidenceType, changed: changed.sort() }]
    })
    .sort((a, b) => a.title.localeCompare(b.title))
}

const oneLine = (value: string, max = 300) => value.replace(/\s+/g, ' ').trim().slice(0, max)

/** What `continuum check` prints: each decision, its label and the anchored code the commit changes. */
export function renderStagedCheck(touched: readonly TouchedDecision[], stagedCount: number): string {
  if (stagedCount === 0) return 'Nothing is staged, so there is nothing to check.'
  if (touched.length === 0) return `No recorded decision is anchored to the code in the ${stagedCount === 1 ? 'staged file' : `${stagedCount} staged files`}.`
  const count = touched.length === 1 ? '1 recorded decision is' : `${touched.length} recorded decisions are`
  return [
    `${count} anchored to code this commit changes:`,
    ...touched.flatMap((decision) => [
      `- ${evidenceTag(decision.evidence)} ${decision.kind}: ${oneLine(decision.title)}${decision.body ? ` (${oneLine(decision.body)})` : ''}`,
      `  changes: ${decision.changed.join(', ')}`,
    ]),
    'If each still holds, commit as you are. If this commit undoes one, record the new decision (record_decision) or mark the old one resolved in the dashboard.',
  ].join('\n')
}
