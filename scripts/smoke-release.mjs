#!/usr/bin/env node
// Exercises the release package the way a user gets it: `npm pack`, install the
// tarball into a scratch project, then drive the installed `continuum` binary
// against a fresh git repository. Run after `npm run bundle`.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RELEASE = join(ROOT, 'dist/release')
/** Roadmap 1.1: the installable package stays small. */
const MAX_TARBALL_BYTES = 5 * 1024 * 1024
const SERVE_TIMEOUT_MS = 15_000

const scratch = mkdtempSync(join(tmpdir(), 'continuum-smoke-'))
const failures = []

function check(name, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${!condition && detail ? `: ${detail}` : ''}`)
  if (!condition) failures.push(name)
}

// The binary's per-user registry goes in the scratch directory, never the real ~/.config.
const ENV = { ...process.env, CONTINUUM_CONFIG_DIR: join(scratch, 'config') }
const run = (command, args, cwd, input) => execFileSync(command, args, { cwd, input, env: ENV, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })

/** npm silently rewrites fields it considers invalid at publish (once, a bin path, with a warning saying it was removed). */
function publishesUnchanged() {
  const dryRun = spawnSync('npm', ['publish', '--dry-run', '--access', 'public', '--loglevel', 'warn'], { cwd: RELEASE, env: ENV, encoding: 'utf8' })
  const output = `${dryRun.stdout}${dryRun.stderr}`
  check('npm publishes package.json without correcting it', !/auto-corrected|errors corrected/.test(output), output.split('\n').filter((line) => /corrected|invalid|removed/.test(line)).join(' | '))
}

function packAndInstall() {
  publishesUnchanged()
  const tarball = join(scratch, run('npm', ['pack', '--silent', '--pack-destination', scratch], RELEASE).trim().split('\n').at(-1))
  check('tarball is under 5 MiB', statSync(tarball).size < MAX_TARBALL_BYTES, `${statSync(tarball).size} bytes`)
  const project = join(scratch, 'install')
  run('mkdir', ['-p', project], scratch)
  writeFileSync(join(project, 'package.json'), '{"name":"smoke","private":true}')
  run('npm', ['install', '--silent', '--no-audit', '--no-fund', tarball], project)
  return join(project, 'node_modules/.bin/continuum')
}

function makeRepo(name = 'repo') {
  const repo = join(scratch, name)
  run('mkdir', ['-p', repo], scratch)
  run('git', ['init', '-q'], repo)
  writeFileSync(join(repo, 'a.txt'), 'hello\n')
  return repo
}

/** Starts `mcp`, lists its tools over stdio and returns their names. */
function mcpTools(bin, repo) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['mcp'], { cwd: repo, env: ENV, stdio: ['pipe', 'pipe', 'inherit'] })
    let buffer = ''
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      for (const line of buffer.split('\n').slice(0, -1)) {
        const message = JSON.parse(line)
        if (message.id === 2) {
          child.kill()
          resolve(message.result.tools.map((tool) => tool.name))
        }
      }
      buffer = buffer.slice(buffer.lastIndexOf('\n') + 1)
    })
    child.on('error', reject)
    const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } })
    send({ method: 'notifications/initialized' })
    send({ id: 2, method: 'tools/list' })
  })
}

/** Starts `serve`, follows the launch link and returns the dashboard HTML. */
function serveDashboard(bin, repo) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['serve', '--port', '0'], { cwd: repo, env: ENV, stdio: ['ignore', 'pipe', 'inherit'] })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('serve did not print a link'))
    }, SERVE_TIMEOUT_MS)
    child.stdout.on('data', async (chunk) => {
      const link = /Continuum dashboard: (\S+)/.exec(String(chunk))?.[1]
      if (!link) return
      clearTimeout(timer)
      try {
        const signIn = await fetch(link, { redirect: 'manual' })
        const cookie = signIn.headers.get('set-cookie')?.split(';')[0] ?? ''
        const page = await fetch(new URL(signIn.headers.get('location'), link), { headers: { cookie } })
        resolve({ status: page.status, html: await page.text() })
      } catch (error) {
        reject(error)
      } finally {
        child.kill('SIGINT')
      }
    })
  })
}

try {
  if (!existsSync(join(RELEASE, 'continuum.js'))) throw new Error('dist/release is missing: run `npm run build && npm run bundle` first.')
  const bin = packAndInstall()
  const name = JSON.parse(readFileSync(join(RELEASE, 'package.json'), 'utf8')).name
  check('the package ships its MIT license', existsSync(join(dirname(dirname(bin)), name, 'LICENSE')) && readFileSync(join(dirname(dirname(bin)), name, 'LICENSE'), 'utf8').startsWith('MIT License'))
  check('--version prints the package version', run(bin, ['--version'], scratch).trim() === JSON.parse(readFileSync(join(RELEASE, 'package.json'), 'utf8')).version)

  const repo = makeRepo()
  run(bin, ['setup', 'claude-code'], repo)
  const mcp = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8')).mcpServers.continuum
  check('setup writes a portable npx invocation', mcp.command === 'npx' && mcp.args[1].startsWith(`${name}@`), JSON.stringify(mcp))

  const hook = (payload) => run(bin, ['ingest'], repo, JSON.stringify({ cwd: repo, ...payload }))
  hook({ hook_event_name: 'SessionStart', session_id: 'smoke-1', source: 'startup' })
  writeFileSync(join(repo, 'a.txt'), 'changed\n')
  hook({ hook_event_name: 'PostToolUse', session_id: 'smoke-1', tool_name: 'Write', tool_input: { file_path: join(repo, 'a.txt') } })
  hook({ hook_event_name: 'SessionEnd', session_id: 'smoke-1', reason: 'exit' })
  const briefing = hook({ hook_event_name: 'SessionStart', session_id: 'smoke-2', source: 'startup' })
  check('the next session is briefed on the last one', briefing.includes('a.txt'), briefing.slice(0, 300))
  check('status reads the store', /\d+ tracked files?/.test(run(bin, ['status'], repo)))

  const tools = await mcpTools(bin, repo)
  check('MCP server lists its tools', ['get_handoff', 'start_task', 'record_decision'].every((tool) => tools.includes(tool)), tools.join(', '))

  const dashboard = await serveDashboard(bin, repo)
  check('serve opens the bundled dashboard', dashboard.status === 200 && dashboard.html.includes('continuum-data'), `HTTP ${dashboard.status}`)

  // A bundle run from outside node_modules writes machine-specific `node <bundle>` commands instead.
  const local = makeRepo('local')
  const bundle = join(RELEASE, 'continuum.js')
  run(process.execPath, [bundle, 'setup', 'claude-code'], local)
  const localServer = JSON.parse(readFileSync(join(local, '.mcp.json'), 'utf8')).mcpServers.continuum
  check('a local bundle configures node with its own path', localServer.args[0] === bundle, JSON.stringify(localServer))
  const configured = JSON.parse(readFileSync(join(local, '.claude/settings.local.json'), 'utf8')).hooks.SessionStart[0].hooks[0]
  run(configured.command, configured.args, local, JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'local-1', cwd: local, source: 'startup' }))
  check('the configured hook command runs', true)
  const doctor = run(process.execPath, [bundle, 'doctor'], local)
  check('doctor passes after setup', /✓ Claude Code hooks registered/.test(doctor) && !/✗/.test(doctor), doctor)
  run(process.execPath, [bundle, 'uninstall', '--purge'], local)
  check('uninstall --purge leaves only the original file', run('git', ['status', '--porcelain', '--ignored'], local).trim() === '?? a.txt')
} catch (error) {
  check('smoke test ran to completion', false, error instanceof Error ? (error.stderr || error.message) : String(error))
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) failed.`)
  process.exit(1)
}
console.log('\nRelease package smoke test passed.')
