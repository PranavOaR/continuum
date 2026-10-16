import { Writable } from 'node:stream'
import { ContextStore } from '@continuum/store'
import { afterEach, describe, expect, it } from 'vitest'
import { CheckInterruptedError, CommandNotFoundError, finalizeTail, MAX_OUTPUT_TAIL_CHARS, runCheck } from '../runCheck'
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

  it('redacts secrets from the stored command, name and output', async () => {
    const { repo, store } = setup()
    const script = "console.log('API_KEY=abc123def and done')"
    const result = await runCheck(store, { root: repo.root, command: NODE, args: ['-e', script, '--', '--token', 's3cr3t'], ...quiet() })
    expect(result.name).not.toContain('s3cr3t')
    const stored = JSON.stringify([...store.events()])
    expect(stored).not.toContain('s3cr3t')
    expect(stored).not.toContain('abc123def')
    expect(stored).toContain('API_KEY=[redacted] and done')
  })

  it('stops the command on abort and records nothing', async () => {
    const { repo, store } = setup()
    const controller = new AbortController()
    const running = runCheck(store, { root: repo.root, command: NODE, args: ['-e', 'setTimeout(() => {}, 10000)'], name: 'slow', signal: controller.signal, ...quiet() })
    setTimeout(() => controller.abort(), 150)
    await expect(running).rejects.toBeInstanceOf(CheckInterruptedError)
    expect(store.checkRun('slow')).toBeUndefined()
  })

  it('keeps running and records when the output destination breaks', async () => {
    const { repo, store } = setup()
    const broken = new Writable({
      write(_chunk, _encoding, done) {
        done(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
      },
    })
    const script = "for (let i = 0; i < 200; i++) console.log('line ' + i)"
    const result = await runCheck(store, { root: repo.root, command: NODE, args: ['-e', script], name: 'piped', stdout: broken, stderr: sink().stream })
    expect(result.status).toBe('passed')
    expect(store.checkRun('piped')).toBeDefined()
  })

  it('keeps the exit code and warns when the rescan after the run fails', async () => {
    const { repo, store } = setup()
    const script = "require('node:fs').rmSync('.git', { recursive: true, force: true }); process.exit(2)"
    const result = await runCheck(store, { root: repo.root, command: NODE, args: ['-e', script], name: 'breaks-git', ...quiet() })
    expect(result.exitCode).toBe(2)
    expect(result.warning).toMatch(/Could not rescan after the run/)
    expect(store.checkRun('breaks-git')?.exitCode).toBe(2)
  })
})

describe('finalizeTail', () => {
  it('never starts with half a surrogate pair', () => {
    const raw = `${'😀'.repeat(MAX_OUTPUT_TAIL_CHARS)}x` // odd length: a naive cut lands mid-pair
    const tail = finalizeTail(raw)
    expect(tail.length).toBeLessThanOrEqual(MAX_OUTPUT_TAIL_CHARS)
    expect(tail.codePointAt(0)).toBe(0x1f600)
  })

  it('keeps multibyte text intact', () => {
    expect(finalizeTail('café €5 ✓ done\n')).toBe('café €5 ✓ done')
  })
})
