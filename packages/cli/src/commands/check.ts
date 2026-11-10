import { loadContinuumIgnore, openWorkspace, readStaged, repositoryRedactor } from '@continuum/capture'
import { decisionsTouchedByStaged, renderStagedCheck } from '@continuum/context'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const CHECK_USAGE = 'Usage: continuum check [--strict]'

/**
 * For a pre-commit hook: lists the recorded decisions whose anchored code the
 * staged changes alter, so a commit that quietly undoes one is seen before it
 * lands. It exits 0 whatever it finds, so it never stops an agent or a person
 * committing, even when it cannot look (Continuum not set up, an unreadable
 * config): it says why on stderr. `--strict` exits 1 when it lists any, or cannot look.
 */
export async function checkCommand(io: Io, args: readonly string[]): Promise<number> {
  const isStrict = args.length === 1 && args[0] === '--strict'
  if (args.length > 0 && !isStrict) {
    io.err(`continuum: unknown check arguments: ${args.join(' ')}`)
    io.err(CHECK_USAGE)
    return EXIT_USAGE
  }
  try {
    return await listTouched(io, isStrict)
  } catch (error) {
    // A pre-commit hook must not stop a commit because Continuum could not look; --strict asked for that.
    if (isStrict) throw error
    io.err(`continuum: check skipped: ${error instanceof Error ? error.message : String(error)}`)
    return EXIT_OK
  }
}

async function listTouched(io: Io, isStrict: boolean): Promise<number> {
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    const [staged, { redact }, isIgnored] = await Promise.all([readStaged(workspace.root, store.graph.keysOfKind('symbol')), repositoryRedactor(workspace.root), loadContinuumIgnore(workspace.root)])
    const touched = decisionsTouchedByStaged(store, staged, isIgnored)
    io.out(redact(renderStagedCheck(touched, staged.paths.length)))
    return isStrict && touched.length > 0 ? EXIT_FAILURE : EXIT_OK
  } finally {
    store.close()
  }
}
