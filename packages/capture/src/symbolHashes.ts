import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ContentHash, IdentityKey } from '@continuum/core'
import type { ContextStore } from '@continuum/store'
import { isIgnored, isRegularFileInRepo, readWorkingTree, type WorkingTree } from './git'
import { extractSymbols, parseSymbolRef } from './symbols'

const SYMBOL_PREFIX = 'symbol:'

/**
 * Current hashes of the given symbols (`symbol:path#name`), read from disk.
 * A symbol whose file is gone, unreadable, ignored or no longer parses is left
 * out, so anything anchored to it reads as changed rather than as safe.
 */
export async function readSymbolHashes(root: string, symbolKeys: readonly IdentityKey[]): Promise<Map<IdentityKey, ContentHash>> {
  const byPath = new Map<string, string[]>()
  for (const key of symbolKeys) {
    const ref = parseSymbolRef(key.slice(SYMBOL_PREFIX.length))
    if (ref) byPath.set(ref.path, [...(byPath.get(ref.path) ?? []), ref.name])
  }
  const found = new Map<IdentityKey, ContentHash>()
  await Promise.all(
    [...byPath].map(async ([path, names]) => {
      if (!(await isRegularFileInRepo(root, path)) || (await isIgnored(root, path))) return
      const symbols = extractSymbols(path, await readFile(join(root, path), 'utf8').catch(() => ''))
      for (const symbol of symbols ?? []) if (names.includes(symbol.name)) found.set(`${SYMBOL_PREFIX}${path}#${symbol.name}`, symbol.hash)
    }),
  )
  return found
}

/** The working tree plus the current hash of every symbol something in the store is anchored to. */
export async function readWorkingTreeWithSymbols(store: ContextStore, root: string): Promise<WorkingTree> {
  const [tree, symbols] = await Promise.all([readWorkingTree(root), readSymbolHashes(root, store.graph.keysOfKind('symbol'))])
  return { ...tree, symbols }
}
