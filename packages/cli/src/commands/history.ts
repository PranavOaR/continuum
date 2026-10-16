import { readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { applyRepositoryRedactions, initWorkspace, loadContinuumIgnore, openWorkspace, redactSecrets, scanRepository } from '@continuum/capture'
import { composeRewrites, forgetPath, rewriteText, type ContextStore, type HistoryExport } from '@continuum/store'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const EXPORT_USAGE = 'Usage: continuum export <file.json>'
export const IMPORT_USAGE = 'Usage: continuum import <file.json>'
/** Larger files are refused before they are read: an export of years of history is far smaller. */
const MAX_IMPORT_BYTES = 512 * 1024 * 1024
/** The export holds the same private history as the store, so only its owner may read it. */
const PRIVATE_FILE_MODE = 0o600

/** Writes this repository's whole recorded history to a JSON file, for backup or another machine. */
export async function exportCommand(io: Io, args: readonly string[]): Promise<number> {
  if (args.length !== 1) {
    io.err(EXPORT_USAGE)
    return EXIT_USAGE
  }
  const target = resolve(io.cwd, args[0])
  const { store } = await openWorkspace(io.cwd)
  try {
    const history = store.exportHistory(io.now())
    try {
      // 'wx': never overwrite an existing file with private history.
      await writeFile(target, JSON.stringify(history), { mode: PRIVATE_FILE_MODE, flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      io.err(`continuum: ${target} already exists; choose another file name.`)
      return EXIT_FAILURE
    }
    io.out(`Exported ${history.events.length} events${history.checkpoint ? ' and a compaction checkpoint' : ''} to ${target}.`)
    io.out('It contains your recorded history: keep it private.')
    return EXIT_OK
  } finally {
    store.close()
  }
}

/** Restores an export into a repository with no recorded history yet, then catches up with the working tree. */
export async function importCommand(io: Io, args: readonly string[]): Promise<number> {
  if (args.length !== 1) {
    io.err(IMPORT_USAGE)
    return EXIT_USAGE
  }
  let history: HistoryExport
  try {
    const file = resolve(io.cwd, args[0])
    if ((await stat(file)).size > MAX_IMPORT_BYTES) throw new Error(`larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB`)
    history = JSON.parse(await readFile(file, 'utf8')) as HistoryExport
  } catch (error) {
    io.err(`continuum: cannot read ${args[0]}: ${error instanceof Error ? error.message : String(error)}`)
    return EXIT_FAILURE
  }
  const { workspace, store } = await initWorkspace(io.cwd)
  try {
    try {
      store.importHistory(history)
    } catch (error) {
      io.err(`continuum: ${error instanceof Error ? error.message : String(error)} Nothing was changed.`)
      return EXIT_FAILURE
    }
    await applyThisRepositoryRules(store, workspace.root, history)
    const { changes } = await scanRepository(store, workspace.root, { now: io.now })
    io.out(`Imported ${history.events.length} events into ${workspace.root}; recorded ${changes.length} change${changes.length === 1 ? '' : 's'} since the export.`)
    return EXIT_OK
  } finally {
    store.close()
  }
}

/**
 * An export may come from another machine or person: hold it to this
 * repository's rules. Paths in .continuumignore are forgotten and every free
 * text is redacted with this repository's patterns.
 */
async function applyThisRepositoryRules(store: ContextStore, root: string, history: HistoryExport): Promise<void> {
  await applyRepositoryRedactions(root)
  const isIgnored = await loadContinuumIgnore(root)
  const paths = new Set<string>()
  for (const { event } of [...history.events, ...(history.checkpoint?.firstEvents ?? [])]) if (event.type === 'file.changed') paths.add(event.payload.path)
  for (const node of history.checkpoint?.state.nodes ?? []) if (node.key.startsWith('file:')) paths.add(node.key.slice('file:'.length))
  const ignored = [...paths].filter(isIgnored)
  store.rewriteHistory(composeRewrites([...ignored.map((path) => forgetPath(path, { scrubText: false })), rewriteText(redactSecrets)]))
  // The file as imported must not linger in freed pages or the write-ahead log.
  store.vacuum()
}
