import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { initWorkspace, scanRepository, openWorkspace } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { createContinuumServer } from '../server'

const sandboxes: Sandbox[] = []
const clients: Client[] = []
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close()
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

let tick = 0
const now = () => new Date(Date.UTC(2026, 9, 16, 12, 0, tick++))

async function connect() {
  const repo = createSandbox({ 'src/auth.ts': 'auth' })
  sandboxes.push(repo)
  const { store } = await initWorkspace(repo.root)
  await scanRepository(store, repo.root)
  store.close()
  const server = createContinuumServer({ cwd: repo.root, version: 'test', now })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  clients.push(client)
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args })
    return { text: (result.content as { text: string }[])[0].text, isError: result.isError === true }
  }
  return { repo, call }
}

describe('task tools', () => {
  it('leave the handoff without a task section until a task starts', async () => {
    const { call } = await connect()
    expect((await call('get_handoff', {})).text).not.toContain('## Current task')
  })

  it('start a task, track its progress and lead the handoff with it', async () => {
    const { call } = await connect()
    const started = await call('start_task', {
      title: 'Add Google sign-in',
      objective: 'Users can sign in with Google',
      acceptance_criteria: ['Callback creates a session', 'State is validated'],
      steps: ['Callback route', 'State validation', 'Tests'],
    })
    expect(started.text).toMatch(/^Started\. Task add-google-sign-in-[0-9a-f]{8}: "Add Google sign-in" is in-progress\. 0\/2 acceptance criteria met\. 3 step\(s\) remaining\.$/)

    const updated = await call('update_task', {
      completed_steps: ['Callback route'],
      criteria_met: ['Callback creates a session'],
      next_action: 'Validate the state parameter',
    })
    expect(updated.text).toContain('1/2 acceptance criteria met. 2 step(s) remaining. Next: Validate the state parameter')

    const handoff = (await call('get_handoff', {})).text
    expect(handoff).toContain('## Current task')
    expect(handoff).toContain('  - [x] Callback creates a session')
    expect(handoff).toContain('Done:\n  - Callback route')

    const finished = await call('update_task', { status: 'completed', next_action: '' })
    expect(finished.text).toContain('is completed')
    expect(finished.text).not.toContain('Next:')
    expect((await call('get_handoff', {})).text).not.toContain('## Current task')
  })

  it('attaches decisions to the current task', async () => {
    const { repo, call } = await connect()
    await call('start_task', { title: 'Sessions' })
    await call('record_decision', { title: 'Sessions live in Redis' })
    const { store } = await openWorkspace(repo.root)
    try {
      const memory = store.graph.keysOfKind('memory')[0]
      expect(store.graph.neighbors(memory, { direction: 'out', types: ['informs'] })).toEqual([expect.stringMatching(/^task:sessions-/)])
    } finally {
      store.close()
    }
  })

  it('explains mistakes instead of guessing', async () => {
    const { call } = await connect()
    expect(await call('update_task', { status: 'blocked' })).toEqual({ text: 'No current task. Start one with start_task first.', isError: true })
    await call('start_task', { title: 'X', acceptance_criteria: ['Works'] })
    expect((await call('update_task', { criteria_met: ['works?'] })).text).toContain('Unknown acceptance criteria: works?')
    expect((await call('update_task', { task_id: 'nope' })).text).toBe('No task "nope".')
    expect((await call('start_task', { title: '' })).isError).toBe(true)
  })

  it('redacts secrets in task text', async () => {
    const { call } = await connect()
    const value = ['not', 'real', 'value'].join('-')
    await call('start_task', { title: 'Deploy', objective: `Use API_KEY=${value}` })
    expect((await call('get_handoff', {})).text).not.toContain(value)
  })
})
