import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXIT_NOT_FOUND, EXIT_USAGE } from '../io'
import { cli } from './harness'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'

const NODE = process.execPath
const sandboxes: Sandbox[] = []
const dirs: string[] = []

function sandbox(files: Record<string, string> = { 'src/a.ts': 'a', 'README.md': 'r' }) {
  const repo = createSandbox(files)
  sandboxes.push(repo)
  return repo
}

afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('continuum (global)', () => {
  it('prints help and version', async () => {
    expect((await cli('/', ['--help'])).out).toContain('Usage: continuum')
    expect((await cli('/', ['--version'])).out).toBe('0.0.0')
  })

  it('shows help with a usage exit code when no command is given', async () => {
    const result = await cli('/', [])
    expect(result.code).toBe(EXIT_USAGE)
    expect(result.out).toContain('Commands')
  })

  it('rejects unknown commands and options', async () => {
    expect(await cli('/', ['frobnicate'])).toMatchObject({ code: EXIT_USAGE, err: expect.stringContaining('unknown command "frobnicate"') })
    expect(await cli('/', ['--bogus'])).toMatchObject({ code: EXIT_USAGE, err: expect.stringContaining('Unknown option: --bogus') })
    expect(await cli('/', ['-C'])).toMatchObject({ code: EXIT_USAGE, err: expect.stringContaining('-C needs a directory') })
    expect((await cli('/', ['toString'])).code).toBe(EXIT_USAGE)
  })

  it('explains when run outside a git repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'continuum-plain-'))
    dirs.push(dir)
    const result = await cli(dir, ['init'])
    expect(result.code).toBe(1)
    expect(result.err).toContain('Not inside a git repository')
  })

  it('asks for init before other commands', async () => {
    const repo = sandbox()
    for (const command of ['status', 'scan', 'start']) {
      const result = await cli(repo.root, [command])
      expect(result.code).toBe(1)
      expect(result.err).toContain('Run `continuum init` first')
    }
  })

  it('honours -C to run in another directory', async () => {
    const repo = sandbox()
    const result = await cli('/', ['-C', repo.root, 'init'])
    expect(result.code).toBe(0)
    expect(existsSync(join(repo.root, '.continuum/context.db'))).toBe(true)
  })
})

describe('continuum init', () => {
  it('creates the store, records files and keeps the store out of git', async () => {
    const repo = sandbox()
    const result = await cli(repo.root, ['init'])
    expect(result.code).toBe(0)
    expect(result.out).toContain(`Initialized Continuum in ${repo.root}`)
    expect(result.out).toContain('2 file changes across 2 tracked files')
    expect(readFileSync(join(repo.root, '.git/info/exclude'), 'utf8')).toContain('/.continuum/')
    expect(repo.git('status', '--porcelain')).not.toContain('.continuum')
  })

  it('is idempotent and never duplicates the exclude entry', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const again = await cli(repo.root, ['init'])
    expect(again.out).toContain('already set up')
    expect(again.out).toContain('0 file changes')
    const exclude = readFileSync(join(repo.root, '.git/info/exclude'), 'utf8')
    expect(exclude.match(/\/\.continuum\//g)).toHaveLength(1)
  })
})

describe('continuum scan', () => {
  it('lists recorded changes, then reports nothing new', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    repo.write('src/a.ts', 'a2')
    repo.write('src/b.ts', 'b')
    repo.remove('README.md')
    const first = await cli(repo.root, ['scan'])
    expect(first.out).toBe('Recorded 3 file changes:\n  - README.md\n  ~ src/a.ts\n  + src/b.ts')
    expect((await cli(repo.root, ['scan'])).out).toBe('No changes since the last scan.')
  })

  it('summarizes long change lists', async () => {
    const repo = sandbox({})
    await cli(repo.root, ['init'])
    for (let index = 0; index < 25; index += 1) repo.write(`f${String(index).padStart(2, '0')}.ts`, String(index))
    const result = await cli(repo.root, ['scan'])
    expect(result.out).toContain('Recorded 25 file changes:')
    expect(result.out).toContain('…and 5 more')
  })
})

describe('continuum run', () => {
  it('passes the command exit code through and records the check', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const passed = await cli(repo.root, ['run', '--name', 'unit', '--', NODE, '-e', "console.log('hello')"])
    expect(passed.code).toBe(0)
    expect(passed.raw).toContain('hello')
    expect(passed.err).toMatch(/recorded "unit" · passed · exit 0 · \d+ms/)
    const failed = await cli(repo.root, ['run', '--name=lint', NODE, '-e', 'process.exit(4)'])
    expect(failed.code).toBe(4)
    expect(failed.err).toContain('recorded "lint" · failed · exit 4')
  })

  it('reports a missing command with exit 127', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const result = await cli(repo.root, ['run', '--', 'continuum-no-such-command'])
    expect(result.code).toBe(EXIT_NOT_FOUND)
    expect(result.err).toContain('Command not found: continuum-no-such-command')
  })

  it('validates its arguments', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    expect((await cli(repo.root, ['run'])).err).toContain('Missing the command to run')
    expect((await cli(repo.root, ['run', '--name'])).err).toContain('--name needs a value')
    expect((await cli(repo.root, ['run', '--name='])).err).toContain('--name cannot be empty')
    expect((await cli(repo.root, ['run', '--watch'])).err).toContain('Unknown option for run: --watch')
  })
})

describe('continuum status', () => {
  it('summarizes the workspace before any checks', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const result = await cli(repo.root, ['status'])
    expect(result.out).toContain(`Workspace  ${repo.root}`)
    expect(result.out).toContain('Revision   no commits yet')
    expect(result.out).toContain('2 tracked files · all recorded')
    expect(result.out).toContain('none recorded yet')
  })

  it('shows check results and goes out of date on unrecorded edits, without writing', async () => {
    const repo = sandbox()
    repo.commit('initial')
    await cli(repo.root, ['init'])
    await cli(repo.root, ['run', '--name', 'unit', '--', NODE, '-e', '0'])
    await cli(repo.root, ['run', '--name', 'lint', '--', NODE, '-e', 'process.exit(1)'])
    expect((await cli(repo.root, ['status'])).out).toMatch(/passed\s+unit\s+ran just now/)

    repo.write('src/a.ts', 'edited')
    const status = await cli(repo.root, ['status'])
    expect(status.out).toContain(`Revision   ${repo.git('rev-parse', '--short', 'HEAD')}`)
    expect(status.out).toContain('1 unrecorded change')
    expect(status.out).toMatch(/out of date\s+lint\s+1 file changed since it ran/)
    expect(status.out).toMatch(/out of date\s+unit\s+1 file changed since it ran/)
    expect((await cli(repo.root, ['scan'])).out).toContain('~ src/a.ts')
  })
})

describe('continuum start', () => {
  it('catches up, records live edits and stops on abort', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    repo.write('offline.ts', 'written while not watching')
    const controller = new AbortController()
    const lines: string[] = []
    const running = cli(repo.root, ['start'], { signal: controller.signal, out: (line) => lines.push(line) })
    await vi.waitFor(() => expect(lines.join('\n')).toContain('Watching'), { timeout: 3000, interval: 20 })
    expect(lines.join('\n')).toContain('Caught up on 1 change since the last scan:\n  + offline.ts')
    repo.write('live.ts', 'live')
    await vi.waitFor(() => expect(lines.join('\n')).toMatch(/\d\d:\d\d:\d\d {2}\+ live\.ts/), { timeout: 5000, interval: 25 })
    controller.abort()
    expect((await running).code).toBe(0)
    expect(lines.at(-1)).toBe('Stopped.')
  })
})
