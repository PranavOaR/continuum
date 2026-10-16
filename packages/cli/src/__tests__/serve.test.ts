import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RESTART_EXIT, serveCommand, type ServeOptions } from '../commands/serve'
import { EXIT_USAGE } from '../io'
import { cli, TEST_CONFIG_DIR } from './harness'

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

async function serving(cwd: string, args: string[], webDist?: string, configDir = TEST_CONFIG_DIR, options: Omit<ServeOptions, 'webDist'> = {}) {
  const controller = new AbortController()
  const lines: string[] = []
  const io = { cwd, out: (line: string) => lines.push(line), err: (line: string) => lines.push(line), now: () => new Date(), signal: controller.signal, readStdin: async () => '', configDir }
  const done = serveCommand(io, args, 'test', { ...(webDist ? { webDist } : {}), ...options })
  await vi.waitFor(() => expect(lines.join('\n')).toContain('Continuum dashboard: http://127.0.0.1:'), { timeout: 5000 })
  const launch = /http:\/\/127\.0\.0\.1:\d+\/app\?token=[\w-]+/.exec(lines.join('\n'))?.[0] as string
  const url = new URL(launch).origin
  const token = new URL(launch).searchParams.get('token') as string
  const auth = { headers: { authorization: `Bearer ${token}` } }
  return { url, launch, auth, lines, stop: async () => (controller.abort(), done) }
}

describe('continuum serve', () => {
  it('serves real repository data until stopped', async () => {
    const first = sandbox()
    const second = sandbox({ 'b.py': 'b' })
    await cli(first.root, ['init'])
    await cli(second.root, ['init'])
    const server = await serving(first.root, ['--port', '0', '.', second.root, first.root], join(tmpdir(), 'continuum-no-such-dist'))
    try {
      expect((await fetch(`${server.url}/api/projects`)).status).toBe(401)
      const body = (await (await fetch(`${server.url}/api/projects`, server.auth)).json()) as { data: unknown[] }
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
      expect(await (await fetch(`${server.url}/app`, server.auth)).text()).toContain('<title>Continuum</title>')
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

describe('continuum serve with no arguments', () => {
  it('shows every repository connected with setup, and drops ones that were uninstalled', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'continuum-registry-'))
    dirs.push(configDir)
    const api = sandbox({ 'api.ts': 'a' })
    const web = sandbox({ 'web.ts': 'w' })
    const elsewhere = mkdtempSync(join(tmpdir(), 'continuum-not-a-repo-'))
    dirs.push(elsewhere)
    await cli(api.root, ['setup', 'claude-code'], { configDir })
    await cli(web.root, ['setup', 'claude-code'], { configDir })

    const server = await serving(elsewhere, ['--port', '0'], join(tmpdir(), 'continuum-no-such-dist'), configDir)
    try {
      expect(server.lines.join('\n')).toContain(`serving ${api.root}`)
      expect(server.lines.join('\n')).toContain(`serving ${web.root}`)
    } finally {
      await server.stop()
    }

    await cli(web.root, ['uninstall', '--purge'], { configDir })
    const after = await serving(elsewhere, ['--port', '0'], join(tmpdir(), 'continuum-no-such-dist'), configDir)
    try {
      expect(after.lines.join('\n')).toContain(`serving ${api.root}`)
      expect(after.lines.join('\n')).not.toContain(web.root)
    } finally {
      await after.stop()
    }
  })

  it('skips a registered repository that was deleted, with a note', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'continuum-registry-'))
    dirs.push(configDir)
    const kept = sandbox({ 'a.ts': 'a' })
    const gone = createSandbox({ 'b.ts': 'b' })
    await cli(kept.root, ['setup', 'claude-code'], { configDir })
    await cli(gone.root, ['setup', 'claude-code'], { configDir })
    gone.cleanup()
    const server = await serving(kept.root, ['--port', '0'], join(tmpdir(), 'continuum-no-such-dist'), configDir)
    try {
      expect(server.lines.join('\n')).toContain(`skipping ${gone.root}: no longer set up`)
      expect(server.lines.filter((line) => line.includes('serving'))).toHaveLength(1)
    } finally {
      await server.stop()
    }
  })
})

describe('continuum serve after an update', () => {
  it('stops with the restart code when its code changes, keeping the access token it was given', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    let version = 'v1'
    const server = await serving(repo.root, ['--port', '0'], join(tmpdir(), 'continuum-no-such-dist'), TEST_CONFIG_DIR, {
      token: 'kept-token-0123456789',
      codeFingerprint: () => version,
      updatePollMs: 20,
    })
    expect(server.launch).toContain('token=kept-token-0123456789')
    version = 'v2'
    await vi.waitFor(() => expect(server.lines.join('\n')).toContain('restarting the dashboard'), { timeout: 3000 })
    expect(await server.stop()).toBe(RESTART_EXIT)
  })
})
