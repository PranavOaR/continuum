import { relative } from 'node:path'
import { diffSnapshots, readWorkingTreeWithSymbols, recordedFiles } from '@continuum/capture'
import { liveHashes } from '@continuum/context'
import { checkStatus, type CheckStatus, type CurrentHashes } from '@continuum/core'
import type { ContextStore } from '@continuum/store'
import { CHECK_LABELS, columns, formatAgo, plural } from '../format'
import { EXIT_OK, type Io } from '../io'
import { openWorkspace } from '@continuum/capture'
import { hookStatuses, type HookStatus } from '../hookStatus'

function checkDetail(status: CheckStatus, changedCount: number, ranAt: unknown, now: Date): string {
  if (status === 'out-of-date') return `${plural(changedCount, 'file')} changed since it ran`
  const when = typeof ranAt === 'string' ? new Date(ranAt) : null
  return when && !Number.isNaN(when.getTime()) ? `ran ${formatAgo(when, now)}` : 'run time unknown'
}

function checkRows(store: ContextStore, current: CurrentHashes, now: Date): string[][] {
  return store.graph
    .keysOfKind('check')
    .map((key) => store.graph.get(key))
    .filter((node) => node !== undefined)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((node) => {
      const name = typeof node.props.name === 'string' ? node.props.name : node.key.slice('check:'.length)
      const { status, changed } = checkStatus(store.checkRun(name), current)
      return [CHECK_LABELS[status], name, checkDetail(status, changed.length, node.props.ranAt, now)]
    })
}

function hookSummary({ name, health }: HookStatus, now: Date): string {
  if (health.isFailing) return `${name}: the last hook failed: ${health.lastFailure?.message ?? 'unknown error'}`
  if (health.lastArrivalAt === null) return `${name}: none yet (run \`continuum doctor\`)`
  return `${name}: last arrived ${formatAgo(new Date(health.lastArrivalAt), now)}`
}

export async function statusCommand(io: Io): Promise<number> {
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    const tree = await readWorkingTreeWithSymbols(store, workspace.root)
    const pending = diffSnapshots(recordedFiles(store), tree.files).length
    const pendingNote = pending === 0 ? 'all recorded' : `${plural(pending, 'unrecorded change')} (run \`continuum scan\` or \`continuum start\`)`
    const hooks = (await hookStatuses(workspace.root)).map((status, index) => [index === 0 ? 'Hooks' : '', hookSummary(status, io.now())])
    const summary = columns([
      ['Workspace', workspace.root],
      ['Revision', tree.revision ?? 'no commits yet'],
      ['Store', `${relative(workspace.root, workspace.storePath)} · ${plural(store.eventCount(), 'event')}`],
      ['Files', `${plural(tree.files.size, 'tracked file')} · ${pendingNote}`],
      ...hooks,
    ])
    for (const line of summary) io.out(line)
    const rows = checkRows(store, liveHashes(store, tree), io.now())
    io.out('')
    if (rows.length === 0) {
      io.out('Checks    none recorded yet. Try `continuum run -- npm test`.')
      return EXIT_OK
    }
    io.out('Checks')
    for (const line of columns(rows)) io.out(`  ${line}`)
    return EXIT_OK
  } finally {
    store.close()
  }
}
