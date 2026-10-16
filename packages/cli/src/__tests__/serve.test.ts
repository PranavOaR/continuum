import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serveCommand } from '../commands/serve'
import { EXIT_USAGE } from '../io'
import { cli } from './harness'

const sandboxes: Sandbox[] = []
const dirs: string[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function sandbox(name: Record<string, string> = { 'a.ts': 'a' }) {
  const repo = createSandbox(name)
  sandboxes.push(repo)
  return repo
}

async function serving(cwd: string, args: string[], webDist?: string) {
  const controller = new AbortController()
  const lines: string[] = []
  const io = { cwd, out: (line: string) => lines.push(line), err: (line: string) => lines.push(line), now: () => new Date(), signal: controller.signal, readStdin: async () => '' }
  const done = serveCommand(io, args, 'test', webDist)
  await vi.waitFor(() => expect(lines.join('\n')).toContain('Continuum dashboard: http://127.0.0.1:'), { timeout: 5000 })
  const url = /http:\/\/127\.0\.0\.1:\d+/.exec(lines[0])?.[0] as string
  return { url, lines, stop: async () => (controller.abort(), done) }
}

describe('continuum serve', () => {
  it('serves real repository data until stopped', async () => {
    const first = sandbox()
    const second = sandbox({ 'b.py': 'b' })
    await cli(first.root, ['init'])
    await cli(second.root, ['init'])
    const server = await serving(first.root, ['--port', '0', '.', second.root, first.root], join(tmpdir(), 'continuum-no-such-dist'))
    try {
      const body = (await (await fetch(`${server.url}/api/projects`)).json()) as { data: unknown[] }
      const projects = body.data
      expect(projects).toHaveLength(2)
      expect(server.lines.join('\n')).toContain('only the API is available')
    } finally {
      expect(await server.stop()).toBe(0)
    }
    expect(server.lines.at(-1)).toBe('Stopped.')
  })

  it('serves the built dashboard when present', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const dist = mkdtempSync(join(tmpdir(), 'continuum-dist-'))
    dirs.push(dist)
    writeFileSync(join(dist, 'index.html'), '<title>Continuum</title>')
    const server = await serving(repo.root, ['--port', '0'], dist)
    try {
      expect(await (await fetch(`${server.url}/app`)).text()).toContain('<title>Continuum</title>')
    } finally {
      await server.stop()
    }
  })

  it('refuses repositories without Continuum and bad options', async () => {
    const repo = sandbox()
    const result = await cli(repo.root, ['serve', '--port', '0'])
    expect(result.code).toBe(1)
    expect(result.err).toContain('Run `continuum init` first')
    expect((await cli(repo.root, ['serve', '--port', 'abc'])).code).toBe(EXIT_USAGE)
    expect((await cli(repo.root, ['serve', '--open'])).err).toContain('Unknown option for serve: --open')
  })
})
