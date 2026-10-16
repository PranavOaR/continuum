import { Writable } from 'node:stream'
import { ContextStore } from '@continuum/store'
import { afterEach, describe, expect, it } from 'vitest'
import { CommandNotFoundError, runCheck } from '../runCheck'
import { createSandbox, type Sandbox } from '../testing'

const NODE = process.execPath
const sandboxes: Sandbox[] = []
const stores: ContextStore[] = []

function setup(files: Record<string, string> = { 'src/a.ts': 'a', 'src/b.ts': 'b' }) {
  const repo = createSandbox(files)
  const store = ContextStore.open(':memory:')
  sandboxes.push(repo)
  stores.push(store)
  return { repo, store }
}

function sink() {
  let text = ''
  const stream = new Writable({
    write(chunk, _encoding, done) {
      text += chunk.toString()
      done()
    },
  })
  return { stream, text: () => text }
}

function quiet() {
  return { stdout: sink().stream, stderr: sink().stream }
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

describe('runCheck', () => {
  it('records a passing run as verified against the current file hashes', async () => {
    const { repo, store } = setup()
    const result = await runCheck(store, { root: repo.root, command: NODE, args: ['-e', 'process.exit(0)'], name: 'unit', ...quiet() })
    expect(result).toMatchObject({ exitCode: 0, status: 'passed' })
    const event = [...store.events()].find((recorded) => recorded.type === 'check.recorded')
    expect(event).toMatchObject({ evidence: 'verified', source: 'cli:run', payload: { name: 'unit', exitCode: 0 } })
    expect(store.checkRun('unit')?.ranAgainst).toEqual({
      'file:src/a.ts': repo.git('hash-object', 'src/a.ts'),
      'file:src/b.ts': repo.git('hash-object', 'src/b.ts'),
    })
  })

  it('records a failing run with its exit code', async () => {
    const { repo, store } = setup()
    const result = await runCheck(store, { root: repo.root, command: NODE, args: ['-e', 'process.exit(3)'], ...quiet() })
    expect(result).toMatchObject({ exitCode: 3, status: 'failed' })
  })

  it('names the check after the command line by default', async () => {
    const { repo, store } = setup()
    const result = await runCheck(store, { root: repo.root, command: NODE, args: ['-e', '0'], ...quiet() })
    expect(result.name).toBe(`${NODE} -e 0`)
    expect(store.checkRun(result.name)).toBeDefined()
  })

  it('streams output through and keeps an ANSI-free tail', async () => {
    const { repo, store } = setup()
    const stdout = sink()
    const script = "console.log('\\u001b[32mok\\u001b[0m line'); console.error('warn line')"
    await runCheck(store, { root: repo.root, command: NODE, args: ['-e', script], name: 'out', stdout: stdout.stream, stderr: sink().stream })
    expect(stdout.text()).toContain('ok')
    const event = [...store.events()].find((recorded) => recorded.type === 'check.recorded')
    const tail = event?.type === 'check.recorded' ? (event.payload.outputTail ?? '') : ''
    expect(tail).toContain('ok line')
    expect(tail).toContain('warn line')
    expect(tail).not.toContain('\u001b')
  })

  it('bounds the stored output tail', async () => {
    const { repo, store } = setup()
    await runCheck(store, { root: repo.root, command: NODE, args: ['-e', "process.stdout.write('x'.repeat(20000) + 'END')"], name: 'big', ...quiet() })
    const event = [...store.events()].find((recorded) => recorded.type === 'check.recorded')
    const tail = event?.type === 'check.recorded' ? (event.payload.outputTail ?? '') : ''
    expect(tail.length).toBeLessThanOrEqual(4000)
    expect(tail.endsWith('END')).toBe(true)
  })

  it('marks the run out of date when the command itself changes a covered file', async () => {
    const { repo, store } = setup()
    const script = "require('node:fs').writeFileSync('src/a.ts', 'rewritten')"
    const result = await runCheck(store, { root: repo.root, command: NODE, args: ['-e', script], name: 'mutating', ...quiet() })
    expect(result.status).toBe('out-of-date')
    expect(store.checkStatus('mutating')).toEqual({ status: 'out-of-date', changed: ['file:src/a.ts'] })
  })

  it('records nothing when the command does not exist', async () => {
    const { repo, store } = setup()
    const before = store.eventCount()
    await expect(
      runCheck(store, { root: repo.root, command: 'continuum-no-such-command', args: [], ...quiet() }),
    ).rejects.toBeInstanceOf(CommandNotFoundError)
    const checks = [...store.events()].filter((recorded) => recorded.type === 'check.recorded')
    expect(checks).toEqual([])
    expect(store.eventCount()).toBeGreaterThanOrEqual(before)
  })
})
