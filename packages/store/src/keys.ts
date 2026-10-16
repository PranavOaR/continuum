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

export function kindOf(key: IdentityKey): NodeKind {
  const kind = key.slice(0, key.indexOf(':'))
  if (!KIND_SET.has(kind)) throw new Error(`Invalid identity key "${key}"`)
  return kind as NodeKind
}
