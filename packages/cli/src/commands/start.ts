import { DEFAULT_POLL_MS, startCapture } from '@continuum/capture'
import { formatChange } from '../format'
import { EXIT_OK, type Io } from '../io'
import { openWorkspace } from '@continuum/capture'
import { listChanges } from './scan'

function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve()
    else signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

/** Captures repository changes in the foreground until interrupted. */
export async function startCommand(io: Io): Promise<number> {
  const { workspace, store } = await openWorkspace(io.cwd)
  let initial = true
  try {
    const capture = await startCapture(store, workspace.root, {
      onChanges: (changes) => {
        if (initial) {
          io.out(`Caught up on ${changes.length} change${changes.length === 1 ? '' : 's'} since the last scan:`)
          listChanges(io, changes)
          return
        }
        const time = io.now().toTimeString().slice(0, 8)
        for (const change of changes) io.out(`${time}  ${formatChange(change)}`)
      },
      onError: (error) => io.err(`continuum: scan failed: ${error instanceof Error ? error.message : String(error)}`),
      onPolling: (reason) =>
        io.err(
          `continuum: cannot watch this repository (${reason}); checking for changes every ${DEFAULT_POLL_MS / 1000}s instead. ` +
            'On Linux, raising fs.inotify.max_user_watches restores instant capture.',
        ),
    })
    initial = false
    io.out(`${capture.mode === 'watching' ? 'Watching' : 'Polling'} ${workspace.root} — press Ctrl-C to stop.`)
    await untilAborted(io.signal)
    await capture.close()
    io.out('Stopped.')
    return EXIT_OK
  } finally {
    store.close()
  }
}
