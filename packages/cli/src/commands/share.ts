import { anchoredPath } from '@continuum/store'
import type { ContextStore, GraphNode } from '@continuum/store'
import {
  loadContinuumIgnore,
  openWorkspace,
  readSharedRecords,
  repositoryRedactor,
  SHARED_FILE,
  SharedFileError,
  sharedHashOf,
  shareEvent,
  sharedRecordOf,
  writeSharedRecords,
  type SharedRecord,
} from '@continuum/capture'
import { KIND_LABELS } from '@continuum/context'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const SHARE_USAGE = 'Usage: continuum share [<id> ... | --all | --remove <id> ...]'
const SHORT_ID = 8

type ShareArgs = { action: 'list' } | { action: 'share'; ids: string[] } | { action: 'all' } | { action: 'remove'; ids: string[] }

function parseShareArgs(args: readonly string[]): ShareArgs | { error: string } {
  if (args.length === 0) return { action: 'list' }
  if (args[0] === '--all') return args.length === 1 ? { action: 'all' } : { error: '--all takes no ids' }
  if (args[0] === '--remove') return args.length > 1 ? { action: 'remove', ids: args.slice(1) } : { error: 'Give the ids to remove' }
  const unknown = args.find((arg) => arg.startsWith('--'))
  return unknown ? { error: `Unknown option for share: ${unknown}` } : { action: 'share', ids: [...args] }
}

class ShareUsageError extends Error {}

/** Records that can be shared, oldest first, as the store holds them. */
function shareableNodes(store: ContextStore): GraphNode[] {
  return store.graph
    .keysOfKind('memory')
    .map((key) => store.graph.get(key) as GraphNode)
    .filter((node) => sharedRecordOf(node) !== null)
    .sort((a, b) => String(a.props.recordedAt ?? a.updatedAt).localeCompare(String(b.props.recordedAt ?? b.updatedAt)))
}

const idOf = (node: GraphNode) => node.key.slice('memory:'.length)

/** The one record each id prefix names; an unknown or ambiguous prefix stops the command. */
function pick(nodes: readonly GraphNode[], prefixes: readonly string[]): GraphNode[] {
  return prefixes.map((prefix) => {
    const matches = nodes.filter((node) => idOf(node).startsWith(prefix))
    if (matches.length === 0) throw new ShareUsageError(`No decision or note starts with "${prefix}". Run continuum share to list them.`)
    if (matches.length > 1) throw new ShareUsageError(`"${prefix}" matches ${matches.length} records; give more of the id.`)
    return matches[0]
  })
}

/** "shared": the file holds this version; "changed": shared, then changed here or in the file; "local": never shared. */
function shareStatus(node: GraphNode, record: SharedRecord): 'shared' | 'changed' | 'local' {
  const held = node.props.sharedHash
  if (typeof held !== 'string') return 'local'
  return held === sharedHashOf(record) ? 'shared' : 'changed'
}

function listLines(entries: readonly { node: GraphNode; record: SharedRecord }[]): string[] {
  if (entries.length === 0) return ['Nothing to share yet: no decisions, known issues or previous attempts are recorded here.']
  return [
    `Decisions and notes you can share through ${SHARED_FILE}:`,
    ...entries.map(({ node, record }) => `  ${idOf(node).slice(0, SHORT_ID)}  ${shareStatus(node, record).padEnd(6)}  ${KIND_LABELS[record.kind]}: ${record.title}`),
    '',
    'Share one with: continuum share <id>   (every record: continuum share --all)',
    'Only what you share leaves this clone, and only through git.',
  ]
}

const plural = (count: number) => `${count} record${count === 1 ? '' : 's'}`

/** What goes in the file: masked by today's redaction rules, with no anchor on a path .continuumignore lists. */
async function recordsToWrite(root: string, nodes: readonly GraphNode[]): Promise<{ node: GraphNode; record: SharedRecord }[]> {
  const [{ redact }, isIgnored] = await Promise.all([repositoryRedactor(root), loadContinuumIgnore(root)])
  return nodes.map((node) => {
    const record = sharedRecordOf(node) as SharedRecord
    const anchors = Object.fromEntries(Object.entries(record.anchors).filter(([key]) => !isIgnored(anchoredPath(key) ?? '')))
    return { node, record: { ...record, title: redact(record.title), body: redact(record.body), anchors } }
  })
}

async function share(io: Io, root: string, store: ContextStore, nodes: readonly GraphNode[]): Promise<void> {
  const chosen = await recordsToWrite(root, nodes)
  const ids = new Set(chosen.map(({ record }) => record.id))
  const { records: existing } = await readSharedRecords(root)
  await writeSharedRecords(root, [...existing.filter((record) => !ids.has(record.id)), ...chosen.map(({ record }) => record)])
  const at = io.now().toISOString()
  store.transact(() => chosen.map(({ node, record }) => shareEvent(node, record, at)))
  io.out(`Shared ${plural(chosen.length)} in ${SHARED_FILE}. Commit it, and your teammates' agents get it in their next briefing.`)
}

async function remove(io: Io, root: string, prefixes: readonly string[]): Promise<void> {
  const { records } = await readSharedRecords(root)
  const missing = prefixes.find((prefix) => !records.some((record) => record.id.startsWith(prefix)))
  if (missing) throw new ShareUsageError(`${SHARED_FILE} has no record starting with "${missing}".`)
  const kept = records.filter((record) => !prefixes.some((prefix) => record.id.startsWith(prefix)))
  await writeSharedRecords(root, kept)
  io.out(`Removed ${plural(records.length - kept.length)} from ${SHARED_FILE}. Clones that already imported it keep their copy.`)
}

/** Lists, shares or unshares decisions through the repository's shared file. */
export async function shareCommand(io: Io, args: readonly string[]): Promise<number> {
  const parsed = parseShareArgs(args)
  if ('error' in parsed) {
    io.err(`continuum: ${parsed.error}`)
    io.err(SHARE_USAGE)
    return EXIT_USAGE
  }
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    const nodes = shareableNodes(store)
    if (parsed.action === 'list') for (const line of listLines(await recordsToWrite(workspace.root, nodes))) io.out(line)
    if (parsed.action === 'share') await share(io, workspace.root, store, pick(nodes, parsed.ids))
    if (parsed.action === 'all') await share(io, workspace.root, store, nodes.filter((node) => node.props.review !== 'resolved'))
    if (parsed.action === 'remove') await remove(io, workspace.root, parsed.ids)
    return EXIT_OK
  } catch (error) {
    if (error instanceof SharedFileError) {
      io.err(`continuum: ${error.message}`)
      return EXIT_FAILURE
    }
    if (!(error instanceof ShareUsageError)) throw error
    io.err(`continuum: ${error.message}`)
    return EXIT_USAGE
  } finally {
    store.close()
  }
}
