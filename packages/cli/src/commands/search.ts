import { loadContinuumIgnore, openWorkspace, readWorkingTreeWithSymbols, repositoryRedactor } from '@continuum/capture'
import { projectState, renderSearch, searchMemory, shareable } from '@continuum/context'
import { EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const SEARCH_USAGE = 'Usage: continuum search [--limit <n>] <words ...>'
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

interface SearchArgs {
  query: string
  limit: number
}

function parseSearchArgs(args: readonly string[]): SearchArgs | { error: string } {
  const words: string[] = []
  let limit = DEFAULT_LIMIT
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === '--limit') {
      const value = Number(args[index + 1])
      if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) return { error: `--limit must be a whole number from 1 to ${MAX_LIMIT}` }
      limit = value
      index += 1
    } else if (token.startsWith('--')) return { error: `Unknown option for search: ${token}` }
    else words.push(token)
  }
  const query = words.join(' ').trim()
  return query === '' ? { error: 'Give the words to look for' } : { query, limit }
}

/** Searches recorded decisions, issues, attempts, tasks and session notes for some words. */
export async function searchCommand(io: Io, args: readonly string[]): Promise<number> {
  const parsed = parseSearchArgs(args)
  if ('error' in parsed) {
    io.err(`continuum: ${parsed.error}`)
    io.err(SEARCH_USAGE)
    return EXIT_USAGE
  }
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    const now = io.now()
    const [tree, { redact }, isIgnored] = await Promise.all([readWorkingTreeWithSymbols(store, workspace.root), repositoryRedactor(workspace.root), loadContinuumIgnore(workspace.root)])
    const results = searchMemory(store, projectState(store, tree, now), parsed.query, { limit: parsed.limit })
    // Shown the way capture stores: masked by today's redaction rules, with nothing .continuumignore lists.
    io.out(redact(renderSearch(shareable(results, { redact, isIgnored }), parsed.query, now)))
    return EXIT_OK
  } finally {
    store.close()
  }
}
