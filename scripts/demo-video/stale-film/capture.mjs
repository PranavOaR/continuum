#!/usr/bin/env node
// Step 1 of the stale-test film: the Friday-to-Monday story, played through
// this checkout's real CLI and MCP server, with every output saved for the
// film's terminals (assets/capture.json).
//
//   node scripts/demo-video/stale-film/capture.mjs --work <dir>
//
// No agent accounts are used: the agents' hook calls and task tool calls are
// sent exactly as Claude Code and Codex send them. Nothing is written outside <dir>.
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const args = process.argv.slice(2)
const work = resolve(args.includes('--work') ? args[args.indexOf('--work') + 1] : 'stale-film-work')
const repo = join(work, 'checkout')
const env = { ...process.env, CONTINUUM_CONFIG_DIR: join(work, 'config'), CONTINUUM_NO_UPDATE_CHECK: '1', NO_COLOR: '1', GIT_AUTHOR_DATE: '2026-11-06T18:00:00', GIT_COMMITTER_DATE: '2026-11-06T18:00:00' }
const CLI = ['--import', join(root, 'node_modules/tsx/dist/loader.mjs'), join(root, 'packages/cli/src/bin.ts')]

const sh = (command, commandArgs, input, extraEnv = {}) => {
  const result = spawnSync(command, commandArgs, { cwd: repo, env: { ...env, ...extraEnv }, input, encoding: 'utf8' })
  if (result.error) throw result.error
  return { code: result.status ?? 1, out: `${result.stdout}${result.stderr}` }
}
const continuum = (...commandArgs) => sh(process.execPath, [...CLI, ...commandArgs])
const hook = (agent, payload) => sh(process.execPath, [...CLI, 'ingest', '--agent', agent], JSON.stringify({ cwd: repo, ...payload }))

const TAX_FIXED = ['// Prices are in cents.', 'exports.addTax = (cents, rate) => cents + Math.round(cents * rate)', ''].join('\n')
const TAX_BUGGY = ['// Prices are in cents.', 'exports.addTax = (cents, rate) => cents * (1 + rate)', ''].join('\n')
const TAX_FRIDAY = ['// Prices are in cents.', 'exports.addTax = (cents, rate) => cents + Math.trunc(cents * rate)', ''].join('\n')
const FILES = {
  'package.json': `${JSON.stringify({ name: 'checkout', private: true, scripts: { test: 'node test.js' } }, null, 2)}\n`,
  'src/tax.js': TAX_BUGGY,
  'test.js': [
    "const assert = require('node:assert')",
    "const { addTax } = require('./src/tax')",
    '',
    'assert.strictEqual(addTax(1000, 0.08), 1080)',
    'assert.strictEqual(addTax(1000, 0.0825), 1083)',
    "console.log('2 tests passed')",
    '',
  ].join('\n'),
}
const write = (path, text) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  writeFileSync(join(repo, path), text)
}

async function mcp(sessionId) {
  const client = new Client({ name: 'film', version: '1' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [...CLI, 'mcp'], cwd: repo, env: { ...env, CLAUDE_CODE_SESSION_ID: sessionId }, stderr: 'ignore' }))
  const call = async (name, input) => (await client.callTool({ name, arguments: input })).content.map((part) => part.text).join('\n')
  return { call, close: () => client.close() }
}

rmSync(work, { recursive: true, force: true })
mkdirSync(repo, { recursive: true })
for (const [path, text] of Object.entries(FILES)) write(path, text)
sh('git', ['init', '-q', '-b', 'main'])
sh('git', ['-c', 'user.name=Film', '-c', 'user.email=film@example.invalid', 'add', '.'])
sh('git', ['-c', 'user.name=Film', '-c', 'user.email=film@example.invalid', 'commit', '-qm', 'checkout'])
const out = { init: continuum('init') }

// Friday: Claude Code fixes the rounding and records a verified pass.
const CLAUDE = 'claude-friday'
hook('claude-code', { session_id: CLAUDE, hook_event_name: 'SessionStart', source: 'startup' })
const claude = await mcp(CLAUDE)
out.startTask = await claude.call('start_task', { title: 'Round tax to the cent', steps: ['Fix addTax rounding', 'Run the tests'] })
write('src/tax.js', TAX_FIXED)
hook('claude-code', { session_id: CLAUDE, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(repo, 'src/tax.js') } })
out.fridayRun = continuum('run', '--name', 'unit', '--', 'npm', 'test', '--silent')
out.fridayUpdate = await claude.call('update_task', { completed_steps: ['Fix addTax rounding', 'Run the tests'], next_action: 'Open the pull request' })
await claude.close()
hook('claude-code', { session_id: CLAUDE, hook_event_name: 'Stop', last_assistant_message: 'addTax rounds to the cent and unit passes. Next: open the pull request.' })
hook('claude-code', { session_id: CLAUDE, hook_event_name: 'SessionEnd', reason: 'logout' })

// Friday, later: "just one line", by hand, outside any agent.
write('src/tax.js', TAX_FRIDAY)
out.scan = continuum('scan')
out.status = continuum('status')

// Monday: Codex opens the same repository and reads its briefing.
const CODEX = 'codex-monday'
hook('codex', { session_id: CODEX, hook_event_name: 'SessionStart', source: 'startup' })
out.handoff = continuum('handoff')
const codex = await mcp(CODEX)
const taskId = /Task (\S+):/.exec(out.startTask)[1]
out.mondayTakeUp = await codex.call('update_task', { task_id: taskId, next_action: 'Re-run unit: src/tax.js changed since it passed' })
out.mondayFail = continuum('run', '--name', 'unit', '--', 'npm', 'test', '--silent')
write('src/tax.js', TAX_FIXED)
hook('codex', { session_id: CODEX, hook_event_name: 'PostToolUse', tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Update File: src/tax.js\n*** End Patch' } })
out.mondayRun = continuum('run', '--name', 'unit', '--', 'npm', 'test', '--silent')
out.complete = await codex.call('update_task', { status: 'completed', next_action: '' })
await codex.close()
out.diffFriday = { before: TAX_FIXED, after: TAX_FRIDAY }

// The replay, as the dashboard's replay page gets it.
out.replay = JSON.parse(sh(process.execPath, ['--import', join(root, 'node_modules/tsx/dist/loader.mjs'), join(here, 'replay.ts'), repo]).out)

const target = join(here, 'assets/capture.json')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`)
console.log(`Saved ${target}`)
