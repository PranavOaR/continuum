import type { IdentityKey } from '@continuum/core'
import type { GraphIndex, GraphNode } from './graphIndex'

/**
 * Full-text search over what people and agents wrote: memory records, tasks
 * and session notes. It reads the projected graph, which is already in memory,
 * so it needs no index of its own: forgetting, compaction and import change
 * what it finds with no extra step, and it works on every supported Node.js
 * (SQLite's FTS5 is not built into node:sqlite before Node 22.16).
 */
export type SearchableKind = 'memory' | 'task' | 'session'
export const SEARCHABLE_KINDS: readonly SearchableKind[] = ['memory', 'task', 'session']

export interface SearchHit {
  key: IdentityKey
  kind: SearchableKind
  /** BM25 over the matched words; only comparable within one search. */
  score: number
  /** The query's words that this record holds, as typed. */
  matched: string[]
  /** The share of the query's words that matched, 0 to 1. */
  coverage: number
}

export interface SearchOptions {
  limit?: number
  kinds?: readonly SearchableKind[]
}

export const DEFAULT_SEARCH_LIMIT = 10
/** Words beyond this many are dropped: a query is a few words, not a document. */
export const MAX_QUERY_TERMS = 16
/** A word in a title counts this many times. */
const TITLE_WEIGHT = 2
/** BM25's usual constants: how fast repeats stop adding, and how much long records are held back. */
const BM25_K1 = 1.2
const BM25_B = 0.75
/** The shortest word that may match the start of a longer one ("auth" in "authorize"). */
const MIN_PREFIX_CHARS = 3
/** Endings are only trimmed from words longer than this, and never below MIN_PREFIX_CHARS. */
const MIN_STEMMED_CHARS = 5
const ENDINGS = ['ing', 'ed', 's'] as const
const FILLER = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'we', 'with'])

function stem(word: string): string {
  if (word.length < MIN_STEMMED_CHARS) return word
  const ending = ENDINGS.find((candidate) => word.endsWith(candidate) && word.length - candidate.length >= MIN_PREFIX_CHARS)
  return ending ? word.slice(0, -ending.length) : word
}

const words = (text: string): string[] => text.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

/** The words of a text as they are compared: lower-cased, identifiers split (sessionCookie, get_context), common endings trimmed. */
export function tokenize(text: string): string[] {
  return words(text).map(stem)
}

const matches = (token: string, term: string) => token === term || (term.length >= MIN_PREFIX_CHARS && token.startsWith(term))

interface QueryTerm {
  typed: string
  stem: string
}

/** The distinct words of a query; filler words are dropped unless nothing else is left. */
function queryTerms(query: string): QueryTerm[] {
  const all = words(query).map((typed) => ({ typed, stem: stem(typed) }))
  const meaningful = all.filter((term) => !FILLER.has(term.typed))
  const distinct = new Map((meaningful.length > 0 ? meaningful : all).map((term) => [term.stem, term]))
  return [...distinct.values()].slice(0, MAX_QUERY_TERMS)
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item : text((item as { text?: unknown } | null)?.text))) : []

interface Document {
  key: IdentityKey
  kind: SearchableKind
  title: string[]
  body: string[]
}

/** The text of a record worth searching; null for one that holds none. */
function documentOf(node: GraphNode): Document | null {
  const { props } = node
  const fields: Record<SearchableKind, { title: string; body: string[] }> = {
    memory: { title: text(props.title), body: [text(props.body), text(props.kind)] },
    task: { title: text(props.title), body: [text(props.objective), text(props.nextAction), ...texts(props.acceptanceCriteria), ...texts(props.completedSteps), ...texts(props.remainingSteps)] },
    session: { title: '', body: [text(props.lastNote), text(props.summary)] },
  }
  const { title, body } = fields[node.kind as SearchableKind]
  const document = { key: node.key, kind: node.kind as SearchableKind, title: tokenize(title), body: tokenize(body.join(' ')) }
  return document.title.length + document.body.length > 0 ? document : null
}

const count = (tokens: readonly string[], term: string) => tokens.reduce((total, token) => total + (matches(token, term) ? 1 : 0), 0)
const weightedLength = (document: Document) => document.title.length * TITLE_WEIGHT + document.body.length
const round = (value: number) => Math.round(value * 1000) / 1000

/** Records holding any of the query's words, best match first. */
export function searchGraph(graph: GraphIndex, query: string, options: SearchOptions = {}): SearchHit[] {
  const terms = queryTerms(query)
  if (terms.length === 0) return []
  const documents = (options.kinds ?? SEARCHABLE_KINDS)
    .flatMap((kind) => graph.keysOfKind(kind))
    .flatMap((key) => documentOf(graph.get(key) as GraphNode) ?? [])
  if (documents.length === 0) return []
  const averageLength = documents.reduce((total, document) => total + weightedLength(document), 0) / documents.length
  const frequencies = documents.map((document) => terms.map((term) => count(document.title, term.stem) * TITLE_WEIGHT + count(document.body, term.stem)))
  const inverse = terms.map((_term, index) => {
    const holding = frequencies.filter((row) => row[index] > 0).length
    return Math.log(1 + (documents.length - holding + 0.5) / (holding + 0.5))
  })
  return documents
    .flatMap((document, row): SearchHit[] => {
      const found = frequencies[row]
      const matched = terms.filter((_term, index) => found[index] > 0).map((term) => term.typed)
      if (matched.length === 0) return []
      const length = BM25_K1 * (1 - BM25_B + (BM25_B * weightedLength(document)) / averageLength)
      const score = found.reduce((total, frequency, index) => total + (inverse[index] * frequency * (BM25_K1 + 1)) / (frequency + length), 0)
      return [{ key: document.key, kind: document.kind, score: round(score), matched, coverage: round(matched.length / terms.length) }]
    })
    .sort((a, b) => b.coverage - a.coverage || b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, options.limit ?? DEFAULT_SEARCH_LIMIT)
}
