import { existsSync, readdirSync, rmdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { CONTINUUM_DIR, includeInGit, locateWorkspace, unregisterRepository } from '@continuum/capture'
import { CODEX_HOOKS_FILE, CURSOR_RULE_FILE, HOOKS_FILE, removeClaudeCodeSetup, removeCodexSetup, removeCursorSetup } from '@continuum/claude-code'
import { isStoreBusy } from '@continuum/store'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const UNINSTALL_USAGE = 'Usage: continuum uninstall [--purge]'

/** Removes a directory only when it is empty, e.g. the .claude/ that setup created. */
function removeIfEmpty(path: string): void {
  if (existsSync(path) && readdirSync(path).length === 0) rmdirSync(path)
}

/**
 * Disconnects Claude Code and, with --purge, deletes the recorded history,
 * leaving the repository as it was before Continuum was set up.
 */
export async function uninstallCommand(io: Io, args: readonly string[]): Promise<number> {
  const purge = args.length === 1 && args[0] === '--purge'
  if (args.length > 0 && !purge) {
    io.err(`continuum: unknown option for uninstall: ${args.join(' ')}`)
    io.err(UNINSTALL_USAGE)
    return EXIT_USAGE
  }
  const { root, storePath } = await locateWorkspace(io.cwd)
  if (purge && existsSync(storePath) && isStoreBusy(storePath)) {
    io.err('continuum: another Continuum process is writing to this repository. Stop `continuum start` and `continuum serve` here, then run uninstall again. Nothing was changed.')
    return EXIT_FAILURE
  }
  const claude = await removeClaudeCodeSetup(root)
  const codex = await removeCodexSetup(root)
  const cursor = await removeCursorSetup(root)
  const result = { files: [...claude.files, ...codex.files, ...cursor.files] }
  await unregisterRepository(io.configDir, root)
  removeIfEmpty(join(root, dirname(HOOKS_FILE)))
  removeIfEmpty(join(root, dirname(CODEX_HOOKS_FILE)))
  removeIfEmpty(join(root, dirname(CURSOR_RULE_FILE)))
  removeIfEmpty(join(root, dirname(dirname(CURSOR_RULE_FILE))))
  for (const file of result.files) io.out(`  ${file.action.padEnd(9)} ${file.path}`)

  const storeDir = join(root, CONTINUUM_DIR)
  if (!existsSync(storeDir)) {
    io.out(result.files.length > 0 ? 'Continuum is removed from this repository.' : 'Continuum was not set up in this repository; nothing to remove.')
    return EXIT_OK
  }
  if (!purge) {
    io.out(`Claude Code is disconnected. The recorded history is kept in ${storePath}.`)
    io.out('To delete it as well, stop any `continuum start` or `continuum serve` for this repository and run `continuum uninstall --purge`.')
    return EXIT_OK
  }
  // Idle watchers are not detectable; a running `continuum start` would keep writing to the deleted file.
  io.out('If `continuum start` or `continuum serve` is still running for this repository, stop it now.')
  await rm(storeDir, { recursive: true, force: true })
  await includeInGit(root)
  io.out(`  removed   ${CONTINUUM_DIR}/ (all recorded history)`)
  io.out('Continuum is removed from this repository.')
  return EXIT_OK
}
