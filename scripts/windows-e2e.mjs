#!/usr/bin/env node
// Plays a Windows user end to end, as close to the real thing as a machine
// without the agents' apps can get. The release package is published to a
// private registry (Verdaccio) on this machine, so the `cmd /c npx -y
// getcontinuum@<version>` lines setup writes download it the way they will
// from npm. Then every hook and MCP server each agent was given runs the way
// that agent starts it: Claude Code (settings and plugin), Codex, Cursor,
// VS Code and Antigravity CLI. The repository lives in a folder with a space and an accent, like
// C:\Users\Jane Doe\café.
//
//   npm run build && npm run bundle && node scripts/windows-e2e.mjs
//
// With --registry npm it plays the same user against what is really published:
// the package comes from registry.npmjs.org (the latest, or --version <x>) and
// the plugin from a clone of the public plugin repository, so nothing built
// in this checkout is used. Run it after a release reaches npm.
//
//   node scripts/windows-e2e.mjs --registry npm [--version 0.4.0]
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RELEASE = join(ROOT, 'dist/release')
const IS_WINDOWS = process.platform === 'win32'
const NPM_REGISTRY = 'https://registry.npmjs.org/'
const PUBLISHED_PACKAGE = 'getcontinuum'
const PLUGIN_REPOSITORY = 'https://github.com/PranavOaR/continuum-plugin.git'
const REGISTRY_PORT = 4873

const argument = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}
const source = argument('--registry') ?? 'private'
if (source !== 'private' && source !== 'npm') {
  console.error('Usage: node scripts/windows-e2e.mjs [--registry private|npm] [--version <x>]')
  process.exit(2)
}
/** Against npm, nothing from this checkout is installed: only what a user can download. */
const IS_PUBLISHED = source === 'npm'
const REGISTRY = IS_PUBLISHED ? NPM_REGISTRY : `http://localhost:${REGISTRY_PORT}/`

/** The version under test: this checkout's release bundle, or the one npm serves. */
function packageUnderTest() {
  if (!IS_PUBLISHED) return JSON.parse(readFileSync(join(RELEASE, 'package.json'), 'utf8'))
  const asked = argument('--version')
  if (asked && !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(asked)) throw new Error(`--version must look like 0.4.0, not ${asked}`)
  const version = asked ?? execFileSync('npm', ['view', PUBLISHED_PACKAGE, 'version', '--registry', NPM_REGISTRY], { encoding: 'utf8', shell: IS_WINDOWS }).trim()
  return { name: PUBLISHED_PACKAGE, version }
}
const { name: PACKAGE, version: VERSION } = packageUnderTest()
const VERDACCIO = 'verdaccio@6.1.6'
const STEP_TIMEOUT_MS = 120_000

const scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'continuum-win-e2e-')))
const failures = []
const check = (name, condition, detail = '') => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${!condition && detail ? `\n       ${String(detail).slice(0, 1500).replaceAll('\n', '\n       ')}` : ''}`)
  if (!condition) failures.push(name)
}

// A user's own npm config: the private registry, and a fresh npx cache so nothing comes from this checkout.
const npmrc = join(scratch, '.npmrc')
const ENV = {
  ...process.env,
  npm_config_userconfig: npmrc,
  npm_config_cache: join(scratch, 'npm-cache'),
  npm_config_registry: REGISTRY,
  npm_config_update_notifier: 'false',
  CONTINUUM_CONFIG_DIR: join(scratch, 'continuum-config'),
  CLAUDE_CONFIG_DIR: join(scratch, 'claude-config'),
}

/** Runs a program directly, with no shell, as agents start hooks and MCP servers. */
function exec(command, args, { cwd, input = '', env = ENV, shell = false } = {}) {
  const started = performance.now()
  const result = spawnSync(command, args, { cwd, input, env, shell, encoding: 'utf8', timeout: STEP_TIMEOUT_MS, windowsHide: true })
  return { status: result.status, stdout: result.stdout ?? '', stderr: `${result.stderr ?? ''}${result.error ? String(result.error) : ''}`, ms: Math.round(performance.now() - started) }
}

/** What a user types in a terminal: through the shell, so npx resolves as it does for them. */
const typed = (line, cwd) => exec(line, [], { cwd, shell: true })

/** Ends a process and everything it started: on Windows, killing cmd.exe would leave node running. */
function killTree(child) {
  if (IS_WINDOWS) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill()
}

/** Starts an MCP server from its config entry, as the agent would, and returns its tool names. */
function mcpTools({ command, args, cwd, env = ENV }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let buffer = ''
    let stderr = ''
    const finish = (value) => {
      clearTimeout(timer)
      killTree(child)
      resolve(value)
    }
    const timer = setTimeout(() => finish({ error: `no reply in ${STEP_TIMEOUT_MS} ms; stderr: ${stderr}` }), STEP_TIMEOUT_MS)
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => finish({ error: String(error) }))
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      for (const line of buffer.split('\n').slice(0, -1)) {
        try {
          const message = JSON.parse(line)
          if (message.id === 2) finish({ tools: message.result.tools.map((tool) => tool.name) })
        } catch {
          // Not a protocol line.
        }
      }
      buffer = buffer.slice(buffer.lastIndexOf('\n') + 1)
    })
    const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'windows-e2e', version: '0' } } })
    send({ method: 'notifications/initialized' })
    send({ id: 2, method: 'tools/list' })
  })
}

const EXPECTED_TOOLS = ['get_handoff', 'start_task', 'update_task', 'record_decision', 'get_context', 'get_project_state']
const hasTools = (result) => Array.isArray(result.tools) && EXPECTED_TOOLS.every((tool) => result.tools.includes(tool))

/** Starts the private registry and publishes the release package to it. */
async function publishToPrivateRegistry() {
  const storage = join(scratch, 'registry')
  mkdirSync(storage)
  const config = join(storage, 'config.yaml')
  writeFileSync(config, [`storage: ${JSON.stringify(join(storage, 'storage'))}`, 'auth:', '  htpasswd:', `    file: ${JSON.stringify(join(storage, 'htpasswd'))}`, 'uplinks:', '  npmjs:', '    url: https://registry.npmjs.org/', 'packages:', `  '${PACKAGE}':`, '    access: $all', '    publish: $authenticated', "  '**':", '    access: $all', '    proxy: npmjs', 'log: { type: stdout, format: pretty, level: warn }', ''].join('\n'))
  const registry = spawn(`npx -y ${VERDACCIO} --config "${config}" --listen ${REGISTRY_PORT}`, { shell: true, stdio: 'ignore', env: { ...process.env, npm_config_registry: NPM_REGISTRY }, windowsHide: true })
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await fetch(`${REGISTRY}-/ping`).then((response) => response.ok, () => false)) break
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  const signUp = await fetch(`${REGISTRY}-/user/org.couchdb.user:e2e`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'e2e', password: 'e2e-password' }) })
  const { token } = await signUp.json()
  writeFileSync(npmrc, `registry=${REGISTRY}\n//localhost:${REGISTRY_PORT}/:_authToken=${token}\n`)
  const published = exec('npm', ['publish', '--registry', REGISTRY], { cwd: RELEASE, shell: IS_WINDOWS })
  check(`the release package is published to a private registry (${PACKAGE}@${VERSION})`, published.status === 0, published.stderr)
  return registry
}

function makeRepo(parent, name) {
  const repo = join(parent, name)
  mkdirSync(join(repo, 'src'), { recursive: true })
  writeFileSync(join(repo, 'src', 'app.js'), 'export const add = (a, b) => a + b\n')
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'demo', private: true, scripts: { test: 'node -e "process.exit(0)"' } }, null, 2))
  exec('git', ['init', '-q'], { cwd: repo })
  exec('git', ['-c', 'user.name=Jane', '-c', 'user.email=jane@example.invalid', 'add', '-A'], { cwd: repo })
  exec('git', ['-c', 'user.name=Jane', '-c', 'user.email=jane@example.invalid', 'commit', '-qm', 'initial'], { cwd: repo })
  return repo
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const payload = (repo, fields) => JSON.stringify({ session_id: fields.session_id ?? 's1', cwd: repo, transcript_path: join(repo, 't.jsonl'), ...fields })
const BRIEFED = 'Files it changed: `src/app.js`'

/** Claude Code: hooks in .claude/settings.local.json and the server in .mcp.json, each started with no shell. */
async function claudeCode(repo) {
  const setup = typed(`npx -y ${PACKAGE}@${VERSION} setup claude-code`, repo)
  check('Claude Code: `npx getcontinuum setup claude-code` succeeds', setup.status === 0, setup.stderr || setup.stdout)
  check('Claude Code: setup names the dashboard command a user can type', setup.stdout.includes(`See what Continuum records: npx -y ${PACKAGE}@${VERSION} serve`), setup.stdout)
  const hooks = readJson(join(repo, '.claude', 'settings.local.json')).hooks
  const hook = (event) => hooks[event][0].hooks[0]
  check('Claude Code: hooks run cmd /c npx', hook('SessionStart').command === 'cmd' && hook('SessionStart').args.join(' ') === `/c npx -y ${PACKAGE}@${VERSION} ingest`, JSON.stringify(hook('SessionStart')))
  const fire = (event, fields) => exec(hook(event).command, hook(event).args, { cwd: repo, input: payload(repo, { hook_event_name: event, ...fields }) })

  const start = fire('SessionStart', { source: 'startup' })
  // A repository with nothing recorded yet has nothing to brief: the hook only has to succeed.
  check(`Claude Code: SessionStart hook runs (${start.ms} ms)`, start.status === 0, start.stderr || start.stdout)
  writeFileSync(join(repo, 'src', 'app.js'), 'export const add = (a, b) => a + b\nexport const sub = (a, b) => a - b\n')
  const edit = fire('PostToolUse', { tool_name: 'Edit', tool_input: { file_path: join(repo, 'src', 'app.js') }, tool_response: {} })
  check(`Claude Code: an edit with a Windows path is recorded (${edit.ms} ms)`, edit.status === 0, edit.stderr)
  const forward = fire('PostToolUse', { tool_name: 'Write', tool_input: { file_path: join(repo, 'src', 'app.js').replaceAll('\\', '/') }, tool_response: {} })
  check('Claude Code: an edit reported with forward slashes is accepted', forward.status === 0, forward.stderr)
  const stop = fire('Stop', { last_assistant_message: 'Added sub().' })
  check('Claude Code: Stop hook runs', stop.status === 0, stop.stderr)
  fire('SessionEnd', { reason: 'exit' })
  const next = fire('SessionStart', { session_id: 's2', source: 'startup' })
  check('Claude Code: the next session is briefed on the edit, credited to the session', next.stdout.includes(BRIEFED), next.stdout.slice(0, 1500))

  const server = readJson(join(repo, '.mcp.json')).mcpServers.continuum
  const tools = await mcpTools({ command: server.command, args: server.args, cwd: repo })
  check('Claude Code: the MCP server starts from .mcp.json and lists its tools', hasTools(tools), JSON.stringify(tools))
}

/** The plugin as Claude Code installs it: this checkout's, with the release bundle, or the public repository's. */
function installPlugin(pluginRoot) {
  if (!IS_PUBLISHED) {
    cpSync(join(ROOT, 'plugin'), pluginRoot, { recursive: true })
    mkdirSync(join(pluginRoot, 'bin'), { recursive: true })
    copyFileSync(join(RELEASE, 'continuum.js'), join(pluginRoot, 'bin', 'continuum.js'))
    return
  }
  const clone = join(scratch, 'marketplace')
  const cloned = exec('git', ['clone', '--depth', '1', PLUGIN_REPOSITORY, clone])
  check('Plugin: the public plugin repository can be cloned', cloned.status === 0, cloned.stderr)
  cpSync(join(clone, 'plugin'), pluginRoot, { recursive: true })
  const published = readJson(join(pluginRoot, '.claude-plugin', 'plugin.json')).version
  check(`Plugin: the public plugin repository carries the version on npm (${VERSION})`, published === VERSION, `plugin.json says ${published}`)
  check('Plugin: the public plugin repository ships its own copy of the CLI', existsSync(join(pluginRoot, 'bin', 'continuum.js')))
}

/** The Claude Code plugin: node starts the launcher with no shell, after Claude Code substitutes ${CLAUDE_PLUGIN_ROOT}. */
async function plugin(repo, plain) {
  const pluginRoot = join(scratch, 'plugin cache', 'continuum')
  installPlugin(pluginRoot)
  const substitute = (entry) => ({ command: entry.command, args: entry.args.map((arg) => arg.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot)) })
  const { hooks } = readJson(join(pluginRoot, 'hooks', 'hooks.json'))
  const start = substitute(hooks.SessionStart[0].hooks[0])
  const env = (project) => ({ ...ENV, CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PROJECT_DIR: project })

  const skipped = exec(start.command, start.args, { cwd: plain, env: env(plain), input: payload(plain, { hook_event_name: 'SessionStart', source: 'startup' }) })
  check(`Plugin: a hook in a repository without Continuum exits quietly (${skipped.ms} ms)`, skipped.status === 0 && skipped.stdout === '', skipped.stderr || skipped.stdout)
  const briefed = exec(start.command, start.args, { cwd: repo, env: env(repo), input: payload(repo, { hook_event_name: 'SessionStart', session_id: 'p1', source: 'startup' }) })
  check(`Plugin: SessionStart briefs from the plugin's own copy of the CLI (${briefed.ms} ms)`, briefed.status === 0 && briefed.stdout.includes('Continuum (local project memory)'), briefed.stderr || briefed.stdout.slice(0, 800))
  const server = substitute(readJson(join(pluginRoot, '.mcp.json')).mcpServers.continuum)
  const tools = await mcpTools({ ...server, cwd: repo, env: env(repo) })
  check("Plugin: the MCP server starts from the plugin's .mcp.json", hasTools(tools), JSON.stringify(tools))
  return pluginRoot
}

/** Codex: hook commands are one string run by a shell (PowerShell or cmd on Windows); the server is in config.toml. */
async function codex(repo) {
  const setup = typed(`npx -y ${PACKAGE}@${VERSION} setup codex`, repo)
  check('Codex: `npx getcontinuum setup codex` succeeds', setup.status === 0, setup.stderr || setup.stdout)
  const line = readJson(join(repo, '.codex', 'hooks.json')).hooks.SessionStart[0].hooks[0].command
  const input = payload(repo, { hook_event_name: 'SessionStart', session_id: 'codex-1', source: 'startup', model: 'gpt-5' })
  const viaPowerShell = exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', line], { cwd: repo, input })
  check(`Codex: the SessionStart hook runs under PowerShell (${viaPowerShell.ms} ms)`, viaPowerShell.status === 0 && viaPowerShell.stdout.includes('Continuum'), viaPowerShell.stderr || viaPowerShell.stdout)
  const viaCmd = exec('cmd', ['/d', '/s', '/c', line], { cwd: repo, input })
  check('Codex: the SessionStart hook runs under cmd', viaCmd.status === 0 && viaCmd.stdout.includes('Continuum'), viaCmd.stderr || viaCmd.stdout)
  const toml = readFileSync(join(repo, '.codex', 'config.toml'), 'utf8')
  const command = JSON.parse(/^command = (.+)$/m.exec(toml)[1])
  const args = JSON.parse(/^args = (\[.+\])$/m.exec(toml)[1])
  check('Codex: config.toml starts the server through cmd /c npx', command === 'cmd' && args[0] === '/c', toml)
  const tools = await mcpTools({ command, args, cwd: repo })
  check('Codex: the MCP server starts from config.toml', hasTools(tools), JSON.stringify(tools))
}

/** Cursor: only an MCP server, in .cursor/mcp.json. */
async function cursor(repo) {
  const setup = typed(`npx -y ${PACKAGE}@${VERSION} setup cursor`, repo)
  check('Cursor: `npx getcontinuum setup cursor` succeeds', setup.status === 0, setup.stderr || setup.stdout)
  const server = readJson(join(repo, '.cursor', 'mcp.json')).mcpServers.continuum
  const tools = await mcpTools({ command: server.command, args: server.args, cwd: repo })
  check('Cursor: the MCP server starts from .cursor/mcp.json', hasTools(tools), JSON.stringify(tools))
}

/** VS Code: on Windows it runs each hook's `powershell` command; the server is in .vscode/mcp.json. */
async function vscode(repo) {
  const setup = typed(`npx -y ${PACKAGE}@${VERSION} setup vscode`, repo)
  check('VS Code: `npx getcontinuum setup vscode` succeeds', setup.status === 0, setup.stderr || setup.stdout)
  const { hooks } = readJson(join(repo, '.github', 'hooks', 'continuum.json'))
  const ps = (event, fields) => exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', hooks[event][0].powershell], { cwd: repo, input: JSON.stringify({ timestamp: new Date().toISOString(), session_id: 'vs-1', hook_event_name: event, cwd: repo, transcript_path: join(repo, 'chat.json'), ...fields }) })
  const start = ps('SessionStart', { source: 'new' })
  check(`VS Code: the SessionStart PowerShell hook briefs Copilot (${start.ms} ms)`, start.status === 0 && start.stdout.includes('Continuum'), start.stderr || start.stdout)
  writeFileSync(join(repo, 'src', 'copilot.js'), 'export const copilot = true\n')
  const created = ps('PostToolUse', { tool_name: 'create_file', tool_input: { filePath: join(repo, 'src', 'copilot.js'), content: 'export const copilot = true' } })
  check(`VS Code: a file Copilot created is recorded through PowerShell (${created.ms} ms)`, created.status === 0, created.stderr)
  const read = ps('PostToolUse', { tool_name: 'read_file', tool_input: { filePath: join(repo, 'src', 'app.js') } })
  check(`VS Code: a read starts nothing (${read.ms} ms)`, read.status === 0 && read.stdout === '', read.stderr || read.stdout)
  ps('Stop', {})
  const next = ps('SessionStart', { session_id: 'vs-2', source: 'new' })
  check('VS Code: the next chat is briefed on the file Copilot created', next.stdout.includes('src/copilot.js'), next.stdout.slice(0, 1500))
  const server = readJson(join(repo, '.vscode', 'mcp.json')).servers.continuum
  const tools = await mcpTools({ command: server.command, args: server.args, cwd: repo })
  check('VS Code: the MCP server starts from .vscode/mcp.json', hasTools(tools), JSON.stringify(tools))
}

/** Antigravity CLI: hook commands are shell strings that name their event; the server is in .agents/mcp_config.json. */
async function antigravity(repo) {
  const setup = typed(`npx -y ${PACKAGE}@${VERSION} setup antigravity`, repo)
  check('Antigravity: `npx getcontinuum setup antigravity` succeeds', setup.status === 0, setup.stderr || setup.stdout)
  const { continuum } = readJson(join(repo, '.agents', 'hooks.json'))
  const line = continuum.SessionStart[0].command
  const input = JSON.stringify({ conversationId: 'agy-1', workspacePaths: [repo], transcriptPath: join(repo, 'agy.json') })
  const viaPowerShell = exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', line], { cwd: repo, input })
  check(`Antigravity: the SessionStart hook replies under PowerShell (${viaPowerShell.ms} ms)`, viaPowerShell.status === 0 && viaPowerShell.stdout.includes('injectSteps'), viaPowerShell.stderr || viaPowerShell.stdout)
  const viaCmd = exec('cmd', ['/d', '/s', '/c', line], { cwd: repo, input })
  check('Antigravity: the SessionStart hook replies under cmd', viaCmd.status === 0 && viaCmd.stdout.includes('injectSteps'), viaCmd.stderr || viaCmd.stdout)
  const stop = exec('cmd', ['/d', '/s', '/c', continuum.Stop[0].command], { cwd: repo, input })
  check('Antigravity: the Stop hook lets the turn end', stop.status === 0 && stop.stdout.includes('"decision":"stop"'), stop.stderr || stop.stdout)
  const server = readJson(join(repo, '.agents', 'mcp_config.json')).mcpServers.continuum
  const tools = await mcpTools({ command: server.command, args: server.args, cwd: server.cwd })
  check('Antigravity: the MCP server starts from .agents/mcp_config.json', hasTools(tools), JSON.stringify(tools))
}

/** The commands a user runs in a terminal. */
async function terminal(repo) {
  const run = typed(`npx -y ${PACKAGE}@${VERSION} run --name tests -- npm test`, repo)
  check('Terminal: `continuum run -- npm test` runs npm (a .cmd shim) and records the result', run.status === 0, run.stderr || run.stdout)
  const status = typed(`npx -y ${PACKAGE}@${VERSION} status`, repo)
  check('Terminal: status shows the verified check', /passed\s+tests/.test(status.stdout), status.stdout)
  const doctor = typed(`npx -y ${PACKAGE}@${VERSION} doctor`, repo)
  check('Terminal: doctor reports no failures on Windows', doctor.stdout.includes('Platform: win32') && !doctor.stdout.includes('✗'), doctor.stdout)
  const handoff = typed(`npx -y ${PACKAGE}@${VERSION} handoff`, repo)
  // Antigravity is the last agent this run plays, so the briefing leads with its session.
  check('Terminal: handoff prints the briefing', handoff.status === 0 && handoff.stdout.includes('Latest: Antigravity CLI session') && handoff.stdout.includes('`tests`'), handoff.stderr || handoff.stdout.slice(0, 800))

  const dashboard = await new Promise((resolve) => {
    const child = spawn(`npx -y ${PACKAGE}@${VERSION} serve --port 0 --no-open`, { cwd: repo, env: ENV, shell: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    const finish = (value) => {
      clearTimeout(timer)
      killTree(child)
      resolve(value)
    }
    const timer = setTimeout(() => finish({ error: `serve printed no link: ${output}` }), STEP_TIMEOUT_MS)
    const onData = async (chunk) => {
      output += chunk
      const link = /Continuum dashboard: (\S+)/.exec(output)?.[1]
      if (!link) return
      child.stdout.off('data', onData)
      try {
        const signIn = await fetch(link, { redirect: 'manual' })
        const cookie = signIn.headers.get('set-cookie')?.split(';')[0] ?? ''
        const page = await fetch(new URL(signIn.headers.get('location'), link), { headers: { cookie } })
        finish({ status: page.status, html: await page.text() })
      } catch (error) {
        finish({ error: String(error) })
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', (chunk) => (output += chunk))
  })
  check('Terminal: serve signs in and opens the dashboard', dashboard.status === 200 && dashboard.html.includes('continuum-data'), JSON.stringify(dashboard).slice(0, 500))
}

async function uninstall(repo) {
  const removed = typed(`npx -y ${PACKAGE}@${VERSION} uninstall --purge`, repo)
  check('Terminal: uninstall --purge succeeds', removed.status === 0, removed.stderr || removed.stdout)
  const left = execFileSync('git', ['status', '--porcelain', '--ignored'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  // What the session itself changed stays; everything Continuum wrote is gone.
  const continuumFiles = left.filter((line) => /\.continuum|\.claude|\.mcp\.json|\.codex|\.cursor|\.vscode|\.github|\.agents/.test(line))
  check('Terminal: uninstall leaves nothing of Continuum behind', continuumFiles.length === 0, left.join('\n'))
}

/** Claude Code's own validator, when it can be installed; it needs no account. */
function validatePlugin(pluginRoot) {
  const result = exec(`npx -y @anthropic-ai/claude-code plugin validate "${pluginRoot}"`, [], { shell: true, env: { ...ENV, npm_config_registry: NPM_REGISTRY } })
  const output = `${result.stdout}${result.stderr}`
  if (/Validation passed/.test(output)) check('Plugin: `claude plugin validate` passes', true)
  else console.log(`note claude plugin validate did not pass or could not run; not counted:\n       ${output.slice(0, 800).replaceAll('\n', '\n       ')}`)
}

let registry
try {
  if (!IS_PUBLISHED && !existsSync(join(RELEASE, 'continuum.js'))) throw new Error('dist/release is missing: run `npm run build && npm run bundle` first.')
  console.log(`Windows end-to-end for ${PACKAGE}@${VERSION} from ${IS_PUBLISHED ? 'npm' : 'a private registry'} on ${process.platform} ${process.arch}, Node ${process.versions.node}, in ${scratch}\n`)
  if (IS_PUBLISHED) writeFileSync(npmrc, `registry=${NPM_REGISTRY}\n`)
  else registry = await publishToPrivateRegistry()
  const home = join(scratch, 'Jane Doe')
  const repo = makeRepo(home, 'café app')
  const plain = makeRepo(home, 'no continuum')
  await claudeCode(repo)
  const pluginRoot = await plugin(repo, plain)
  await codex(repo)
  await cursor(repo)
  await vscode(repo)
  await antigravity(repo)
  await terminal(repo)
  validatePlugin(pluginRoot)
  await uninstall(repo)
} catch (error) {
  check('the end-to-end run completed', false, error instanceof Error ? error.stack : String(error))
} finally {
  if (registry) killTree(registry)
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log('\nWindows end-to-end passed.')
