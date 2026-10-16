import { createHash } from 'node:crypto'
import type { ContentHash } from '@continuum/core'

/** JSON with object keys sorted at every level, so equal values always serialise identically. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

export function hashContent(content: string | Uint8Array): ContentHash {
  return createHash('sha256').update(content).digest('hex')
}

/** Hash of a structured record, namespaced by kind so equal payloads of different kinds never collide. */
export function hashRecord(kind: string, value: unknown): ContentHash {
  return hashContent(`${kind}\0${canonicalJson(value)}`)
}
