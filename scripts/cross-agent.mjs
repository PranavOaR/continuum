#!/usr/bin/env node
// Cross-agent handoff test: Claude Code starts a task and stops halfway; Codex,
// briefed only by Continuum, continues the same task. Run before each release:
//
//   node scripts/cross-agent.mjs [--codex-model <model>]
//
// It uses real Claude Code and Codex sessions (your accounts), in a throwaway
// repository; nothing is written outside it (Codex trust is passed per run).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = ['--import', join(ROOT, 'node_modules/tsx/dist/loader.mjs'), join(ROOT, 'packages/cli/src/bin.ts')]
const AGENT_TIMEOUT_MS = 300_000
const args = process.argv.slice(2)
const codexModel = args.includes('--codex-model') ? args[args.indexOf('--codex-model') + 1] : undefined

const repo = mkdtempSync(join(tmpdir(), 'continuum-cross-agent-'))
// Outside the repository, so it is not captured as one of its files.
const configDir = mkdtempSync(join(tmpdir(), 'continuum-cross-agent-config-'))
const env = { ...process.env, CONTINUUM_CONFIG_DIR: configDir }
const run = (command, commandArgs, options = {}) => execFileSync(command, commandArgs, { cwd: repo, env, encoding: 'utf8', timeout: AGENT_TIMEOUT_MS, ...options })
const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? `: ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

try {
  writeFileSync(join(repo, 'math.js'), 'exports.add = (a, b) => a - b\nexports.multiply = (a, b) => a + b\n')
  writeFileSync(join(repo, 'test.js'), "const m = require('./math')\nif (m.add(2, 3) !== 5 || m.multiply(2, 3) !== 6) { console.error('FAIL'); process.exit(1) }\nconsole.log('ok')\n")
  run('git', ['init', '-q'])
  run('git', ['-c', 'user.name=x', '-c', 'user.email=x@example.invalid', 'add', '-A'])
  run('git', ['-c', 'user.name=x', '-c', 'user.email=x@example.invalid', 'commit', '-qm', 'two bugs'])
  run(process.execPath, [...CLI, 'setup', 'claude-code'])
  run(process.execPath, [...CLI, 'setup', 'codex'])
  // Claude Code asks before using a project's MCP server; approve it for this throwaway repo only.
  const settingsPath = join(repo, '.claude/settings.local.json')
  writeFileSync(settingsPath, JSON.stringify({ ...JSON.parse(readFileSync(settingsPath, 'utf8')), enabledMcpjsonServers: ['continuum'] }, null, 2))

  console.log('Claude Code: start the task, fix add only, then stop.')
  run('claude', [
    '-p',
    'Call the continuum MCP tool start_task with title "Fix math.js" and steps ["Fix add", "Fix multiply"]. Fix only add in math.js (a + b). Then call update_task with completed_steps ["Fix add"] and next_action "Fix multiply in math.js", and stop without touching multiply. Reply in one sentence.',
    '--allowedTools', 'Edit', 'mcp__continuum__start_task', 'mcp__continuum__update_task',
  ])

  console.log('Codex: continue from the briefing alone.')
  run('codex', [
    'exec', ...(codexModel ? ['-m', codexModel] : []), '-C', repo, '-s', 'workspace-write',
    '-c', `projects."${repo}".trust_level="trusted"`, '--dangerously-bypass-hook-trust',
    'Continue the task you were briefed on at the start of this session. When it is done, call the continuum MCP tool update_task with status "completed". Reply in one sentence.',
  ])

  const math = readFileSync(join(repo, 'math.js'), 'utf8')
  check('the code is fixed by the two agents together', /a \+ b/.test(math) && /a \* b/.test(math), math)

  const db = new DatabaseSync(join(repo, '.continuum/context.db'), { readOnly: true })
  const events = db.prepare('SELECT type, source, payload FROM events ORDER BY seq').all().map((row) => ({ ...row, payload: JSON.parse(row.payload) }))
  db.close()
  const sessions = new Map(events.filter((event) => event.type === 'session.started').map((event) => [event.payload.sessionId, event.payload.agent]))
  const taskOf = (agent) => events.find((event) => event.type === 'session.task' && sessions.get(event.payload.sessionId) === agent)?.payload.taskId
  const claudeTask = taskOf('claude-code')
  check('Claude linked its session to the task', claudeTask !== undefined)
  check('Codex took up the same task', taskOf('codex') === claudeTask, `${taskOf('codex')} vs ${claudeTask}`)
  const editedBy = (agent) => events.filter((event) => event.type === 'file.changed' && sessions.get(event.payload.sessionId) === agent).map((event) => event.payload.path)
  check('each agent’s edit is attributed to it', editedBy('claude-code').includes('math.js') && editedBy('codex').includes('math.js'), JSON.stringify({ claude: editedBy('claude-code'), codex: editedBy('codex') }))
  const last = events.filter((event) => event.type === 'task.upserted' && event.payload.id === claudeTask).at(-1)
  check('the task ends completed', last?.payload.status === 'completed', JSON.stringify(last?.payload))
} catch (error) {
  check('the run completed', false, error instanceof Error ? (error.stderr || error.message) : String(error))
} finally {
  rmSync(configDir, { recursive: true, force: true })
  if (!args.includes('--keep')) rmSync(repo, { recursive: true, force: true })
  else console.log(`Kept ${repo}`)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} cross-agent check(s) failed.`)
  process.exit(1)
}
console.log('\nClaude Code handed the task to Codex through Continuum.')
