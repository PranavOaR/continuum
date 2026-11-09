#!/usr/bin/env node
// Exercises the release package the way a user gets it: `npm pack`, install the
// tarball into a scratch project, then drive the installed `continuum` binary
// against a fresh git repository. Run after `npm run bundle`.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RELEASE = join(ROOT, 'dist/release')
/** Roadmap 1.1: the installable package stays small. */
const MAX_TARBALL_BYTES = 5 * 1024 * 1024
const SERVE_TIMEOUT_MS = 15_000
/** npm, npx and the installed `continuum` are .cmd shims on Windows, which only a shell can start. */
const IS_WINDOWS = process.platform === 'win32'

const scratch = mkdtempSync(join(tmpdir(), 'continuum-smoke-'))
const failures = []

function check(name, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${!condition && detail ? `: ${detail}` : ''}`)
  if (!condition) failures.push(name)
}

// The binary's per-user registry goes in the scratch directory, never the real ~/.config.
const ENV = { ...process.env, CONTINUUM_CONFIG_DIR: join(scratch, 'config') }
const run = (command, args, cwd, input) => execFileSync(command, args, { cwd, input, env: ENV, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
/** A shell joins arguments with spaces, so quote any that hold one. */
const shellArgs = (args) => (IS_WINDOWS ? args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)) : args)
const npm = (args, cwd) => execFileSync('npm', shellArgs(args), { cwd, env: ENV, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], shell: IS_WINDOWS })

/** npm silently rewrites fields it considers invalid at publish (once, a bin path, with a warning saying it was removed). */
function publishesUnchanged() {
  const dryRun = spawnSync('npm', ['publish', '--dry-run', '--access', 'public', '--loglevel', 'warn'], { cwd: RELEASE, env: ENV, encoding: 'utf8', shell: IS_WINDOWS })
  const output = `${dryRun.stdout}${dryRun.stderr}`
  check('npm publishes package.json without correcting it', !/auto-corrected|errors corrected/.test(output), output.split('\n').filter((line) => /corrected|invalid|removed/.test(line)).join(' | '))
}

function packAndInstall() {
  publishesUnchanged()
  const tarball = join(scratch, npm(['pack', '--silent', '--pack-destination', scratch], RELEASE).trim().split('\n').at(-1).trim())
  check('tarball is under 5 MiB', statSync(tarball).size < MAX_TARBALL_BYTES, `${statSync(tarball).size} bytes`)
  const project = join(scratch, 'install')
  mkdirSync(project, { recursive: true })
  writeFileSync(join(project, 'package.json'), '{"name":"smoke","private":true}')
  npm(['install', '--silent', '--no-audit', '--no-fund', tarball], project)
  return project
}

/**
 * How to start the installed binary. On Windows npm installs a .cmd shim, which needs a shell, and
 * killing a shell would leave the CLI running; so the CLI's file is started with node, and the shim
 * is checked on its own.
 */
function installedCli(project, name) {
  const shim = join(project, 'node_modules/.bin', IS_WINDOWS ? 'continuum.cmd' : 'continuum')
  if (!IS_WINDOWS) return { command: shim, args: [] }
  const version = execFileSync(`"${shim}"`, ['--version'], { env: ENV, encoding: 'utf8', shell: true }).trim()
  check('the installed continuum.cmd runs', version === JSON.parse(readFileSync(join(RELEASE, 'package.json'), 'utf8')).version, version)
  return { command: process.execPath, args: [join(project, 'node_modules', name, 'continuum.js')] }
}

function makeRepo(name = 'repo') {
  const repo = join(scratch, name)
  mkdirSync(repo, { recursive: true })
  run('git', ['init', '-q'], repo)
  writeFileSync(join(repo, 'a.txt'), 'hello\n')
  return repo
}

/** Starts `mcp`, lists its tools over stdio and returns their names. */
function mcpTools(cli, repo) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli.command, [...cli.args, 'mcp'], { cwd: repo, env: ENV, stdio: ['pipe', 'pipe', 'inherit'] })
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
function serveDashboard(cli, repo) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli.command, [...cli.args, 'serve', '--port', '0'], { cwd: repo, env: ENV, stdio: ['ignore', 'pipe', 'inherit'] })
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

/**
 * The Claude Code plugin's hooks start its own copy of the bundle with node, as
 * scripts/sync-plugin-repo.mjs assembles it. An npx that fails comes first on
 * PATH, so a hook that fell back to npx would fail.
 */
function pluginHooksRunTheBundle(repo) {
  const pluginRoot = join(scratch, 'plugin')
  mkdirSync(join(pluginRoot, 'bin'), { recursive: true })
  copyFileSync(join(ROOT, 'plugin/launcher.mjs'), join(pluginRoot, 'launcher.mjs'))
  copyFileSync(join(RELEASE, 'continuum.js'), join(pluginRoot, 'bin/continuum.js'))
  const noNpx = join(scratch, 'no-npx')
  mkdirSync(noNpx)
  writeFileSync(join(noNpx, 'npx'), '#!/bin/sh\necho "npx was started" >&2\nexit 1\n')
  chmodSync(join(noNpx, 'npx'), 0o755)
  writeFileSync(join(noNpx, 'npx.cmd'), '@echo npx was started 1>&2\r\n@exit /b 1\r\n')
  const [handler] = JSON.parse(readFileSync(join(ROOT, 'plugin/hooks/hooks.json'), 'utf8')).hooks.SessionStart[0].hooks
  // As Claude Code runs it: placeholders substituted, the command started directly, with no shell.
  const args = handler.args.map((arg) => arg.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot))
  const env = { ...ENV, CLAUDE_PROJECT_DIR: repo, CLAUDE_PLUGIN_ROOT: pluginRoot, PATH: `${noNpx}${delimiter}${process.env.PATH}` }
  const started = performance.now()
  const result = spawnSync(handler.command, args, { cwd: repo, env, encoding: 'utf8', input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'plugin-1', cwd: repo, source: 'startup' }) })
  const elapsed = Math.round(performance.now() - started)
  check(`the plugin's SessionStart hook runs its own bundle, not npx (${elapsed} ms)`, result.status === 0 && result.stdout.includes('Continuum (local project memory)'), result.stderr || result.stdout.slice(0, 300))
}

try {
  if (!existsSync(join(RELEASE, 'continuum.js'))) throw new Error('dist/release is missing: run `npm run build && npm run bundle` first.')
  const project = packAndInstall()
  const { name, version } = JSON.parse(readFileSync(join(RELEASE, 'package.json'), 'utf8'))
  const installed = join(project, 'node_modules', name)
  const cli = installedCli(project, name)
  const runCli = (args, cwd, input) => run(cli.command, [...cli.args, ...args], cwd, input)
  const shipped = (file) => (existsSync(join(installed, file)) ? readFileSync(join(installed, file), 'utf8') : '')
  check('the package ships its license', shipped('LICENSE').startsWith('Continuum Software License'))
  check('the package ships the licenses of what it bundles', /## react \d/.test(shipped('THIRD_PARTY_NOTICES.md')) && /## zod \d/.test(shipped('THIRD_PARTY_NOTICES.md')))
  check('the package ships the user README, not the repository one', shipped('README.md').includes('npx getcontinuum setup') && !shipped('README.md').includes('npm run dev'))
  // Fully minified: Continuum's own function names do not survive into the bundle.
  check('the bundle is minified, with no source map', !shipped('continuum.js').includes('function renderHandoff') && !shipped('continuum.js').includes('sourceMappingURL'))
  check('--version prints the package version', runCli(['--version'], scratch).trim() === version)

  const repo = makeRepo()
  const setupOutput = runCli(['setup', 'claude-code'], repo)
  check('setup ends by naming the command that opens the dashboard', setupOutput.trim().endsWith(`See what Continuum records: npx -y ${name}@${version} serve`), setupOutput)
  const mcp = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8')).mcpServers.continuum
  const npxCommand = ['npx', '-y', `${name}@${version}`, 'mcp']
  if (IS_WINDOWS) check('setup writes npx through cmd /c on Windows', JSON.stringify([mcp.command, ...mcp.args]) === JSON.stringify(['cmd', '/c', ...npxCommand]), JSON.stringify(mcp))
  else check('setup writes a portable npx invocation', JSON.stringify([mcp.command, ...mcp.args]) === JSON.stringify(npxCommand), JSON.stringify(mcp))

  const hook = (payload) => runCli(['ingest'], repo, JSON.stringify({ cwd: repo, ...payload }))
  hook({ hook_event_name: 'SessionStart', session_id: 'smoke-1', source: 'startup' })
  writeFileSync(join(repo, 'a.txt'), 'changed\n')
  hook({ hook_event_name: 'PostToolUse', session_id: 'smoke-1', tool_name: 'Write', tool_input: { file_path: join(repo, 'a.txt') } })
  hook({ hook_event_name: 'SessionEnd', session_id: 'smoke-1', reason: 'exit' })
  const briefing = hook({ hook_event_name: 'SessionStart', session_id: 'smoke-2', source: 'startup' })
  // Credited to the session, not merely seen as a change outside agent sessions: that needs the edit's path and the repository root to agree (on Windows, C:\\… against git's C:/…).
  check('the next session is briefed on the last one', briefing.includes('Files it changed: `a.txt`'), briefing.slice(0, 600))
  check('status reads the store', /\d+ tracked files?/.test(runCli(['status'], repo)))

  const tools = await mcpTools(cli, repo)
  check('MCP server lists its tools', ['get_handoff', 'start_task', 'record_decision'].every((tool) => tools.includes(tool)), tools.join(', '))

  pluginHooksRunTheBundle(repo)

  const dashboard = await serveDashboard(cli, repo)
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
