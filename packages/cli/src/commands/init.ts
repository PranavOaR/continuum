import { relative } from 'node:path'
import { scanRepository } from '@continuum/capture'
import { plural } from '../format'
import { EXIT_OK, type Io } from '../io'
import { initWorkspace } from '../workspace'

export async function initCommand(io: Io): Promise<number> {
  const { workspace, store, created } = await initWorkspace(io.cwd)
  try {
    const { changes, tree } = await scanRepository(store, workspace.root, { now: io.now })
    io.out(created ? `Initialized Continuum in ${workspace.root}` : `Continuum is already set up in ${workspace.root}`)
    io.out(`  store     ${relative(workspace.root, workspace.storePath)} (kept out of git via .git/info/exclude)`)
    io.out(`  recorded  ${plural(changes.length, 'file change')} across ${plural(tree.files.size, 'tracked file')}`)
    io.out('')
    io.out('Next: `continuum start` to capture changes as you work,')
    io.out('      `continuum run -- <test command>` to record a verified check.')
    return EXIT_OK
  } finally {
    store.close()
  }
}
