import { AGENTS, type AgentType } from '@continuum/core'

/** Ids are scoped by project so several repositories can share one dashboard. */
export const ids = {
  file: (projectId: string, path: string) => `${projectId}~file~${path}`,
  check: (projectId: string, name: string) => `${projectId}~check~${name}`,
  memory: (projectId: string, id: string) => `${projectId}~memory~${id}`,
  session: (projectId: string, id: string) => `${projectId}~session~${id}`,
  event: (projectId: string, seq: number) => `${projectId}~event~${seq}`,
}

/** The stored id inside a dashboard memory id, or null when it belongs to another project. */
export function storedMemoryId(projectId: string, memoryId: string): string | null {
  const prefix = ids.memory(projectId, '')
  return memoryId.startsWith(prefix) ? memoryId.slice(prefix.length) : null
}

const KNOWN_AGENTS = new Set<string>(AGENTS.map((agent) => agent.id))

export function asAgent(value: unknown): AgentType {
  return typeof value === 'string' && KNOWN_AGENTS.has(value) ? (value as AgentType) : 'other'
}

export const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

/** Lowercase, URL-safe project ids derived from repository folder names, unique within one daemon. */
export function projectIds(names: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  })
}
