// Prints the replay of the repository's only task as JSON, as the dashboard's replay route builds it.
import { openWorkspace } from '@continuum/capture'
import { taskReplay } from '@continuum/context'

const { store } = await openWorkspace(process.argv[2] ?? process.cwd())
try {
  const [key] = store.graph.keysOfKind('task')
  if (!key) throw new Error('No task recorded')
  const taskId = key.replace(/^task:/, '')
  console.log(JSON.stringify(taskReplay([...store.events()].map((event) => store.selfContained(event)), taskId)))
} finally {
  store.close()
}
