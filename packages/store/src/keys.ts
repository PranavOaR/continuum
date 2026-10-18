import type { IdentityKey } from '@continuum/core'

export const NODE_KINDS = ['project', 'task', 'session', 'file', 'symbol', 'check', 'memory'] as const
export type NodeKind = (typeof NODE_KINDS)[number]

const KIND_SET = new Set<string>(NODE_KINDS)

/** Repository-relative posix path: forward slashes, no leading `./`, no duplicate separators. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^(\.\/)+/, '')
}

export const keys = {
  project: (id: string): IdentityKey => `project:${id}`,
  task: (id: string): IdentityKey => `task:${id}`,
  session: (id: string): IdentityKey => `session:${id}`,
  file: (path: string): IdentityKey => `file:${normalizePath(path)}`,
  symbol: (path: string, name: string): IdentityKey => `symbol:${normalizePath(path)}#${name}`,
  check: (name: string): IdentityKey => `check:${name}`,
  memory: (id: string): IdentityKey => `memory:${id}`,
}

/** The file an anchor points into: `file:src/a.ts` and `symbol:src/a.ts#login` are both `src/a.ts`; other keys have none. */
export function anchoredPath(key: IdentityKey): string | null {
  if (key.startsWith('file:')) return key.slice('file:'.length)
  if (key.startsWith('symbol:')) return key.slice('symbol:'.length, key.lastIndexOf('#'))
  return null
}

/** The repository itself: holds repository-wide facts such as the last recorded HEAD. */
export const REPOSITORY_NODE: IdentityKey = keys.project('repository')

export function kindOf(key: IdentityKey): NodeKind {
  const kind = key.slice(0, key.indexOf(':'))
  if (!KIND_SET.has(kind)) throw new Error(`Invalid identity key "${key}"`)
  return kind as NodeKind
}
