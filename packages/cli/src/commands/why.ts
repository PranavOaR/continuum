import { relative, resolve } from 'node:path'
import { isRegularFileInRepo, loadContinuumIgnore, openWorkspace, parseSymbolRef, readWorkingTreeWithSymbols, repositoryRedactor } from '@continuum/capture'
import { explain, projectState, renderWhy, type WhyTarget } from '@continuum/context'
import { normalizePath } from '@continuum/store'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const WHY_USAGE = 'Usage: continuum why <file | file#symbol>'

/** The file or `file#symbol` typed, relative to where the command ran, as a repository path. */
async function resolveTarget(root: string, cwd: string, typed: string): Promise<WhyTarget> {
  const toPath = (file: string) => normalizePath(relative(root, resolve(cwd, file)))
  // A file whose name contains # (docs/a#b.md) is a file, not a symbol reference.
  const symbol = (await isRegularFileInRepo(root, toPath(typed))) ? null : parseSymbolRef(typed)
  return symbol ? { path: toPath(symbol.path), symbol: symbol.name } : { path: toPath(typed) }
}

/** The decisions, tasks, checks and sessions behind a file or one of its symbols. */
export async function whyCommand(io: Io, args: readonly string[]): Promise<number> {
  if (args.length !== 1 || args[0].startsWith('--')) {
    io.err(`continuum: ${args.length === 0 ? 'Give a file, or a symbol as file#name' : `Unexpected arguments: ${args.join(' ')}`}`)
    io.err(WHY_USAGE)
    return EXIT_USAGE
  }
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    const target = await resolveTarget(workspace.root, io.cwd, args[0])
    if (target.path === '' || target.path.startsWith('../')) {
      io.err(`continuum: ${args[0]} is outside this repository.`)
      return EXIT_FAILURE
    }
    const [tree, { redact }, isIgnored] = await Promise.all([readWorkingTreeWithSymbols(store, workspace.root), repositoryRedactor(workspace.root), loadContinuumIgnore(workspace.root)])
    if (isIgnored(target.path)) {
      io.out(`${target.path} is listed in .continuumignore, so Continuum shows nothing about it.`)
      return EXIT_OK
    }
    const now = io.now()
    io.out(redact(renderWhy(explain(store, projectState(store, tree, now), target), now)))
    return EXIT_OK
  } finally {
    store.close()
  }
}
