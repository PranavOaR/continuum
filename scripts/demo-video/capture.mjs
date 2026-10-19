#!/usr/bin/env node
// Step 1 of the demo video: a real handoff, recorded with the published package.
// Claude Code fixes one of two bugs and stops; Codex, briefed only by
// Continuum, finishes; you record a verified test run. Every command's real
// output is saved for the video's terminal scenes.
//
//   node scripts/demo-video/capture.mjs --work <dir> [--codex-model <model>]
//
// Uses your Claude Code and Codex accounts. Nothing is written outside <dir>
// (Codex trust is passed per run, and Continuum's registry lives in <dir>).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const PACKAGE = '@pranavoar/continuum@0.1.0'
const AGENT_TIMEOUT_MS = 600_000
const args = process.argv.slice(2)
/** The value after `name`; a missing value (the end, or another --flag) is an error, not a path. */
const option = (name) => {
  if (!args.includes(name)) return undefined
  const value = args[args.indexOf(name) + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`)
  return value
}
const work = resolve(option('--work') ?? 'demo-video-work')
const codexModel = option('--codex-model')

const repo = join(work, 'pricing')
const env = { ...process.env, CONTINUUM_CONFIG_DIR: join(work, 'config'), npm_config_update_notifier: 'false', NO_COLOR: '1' }
const run = (command, commandArgs, input) =>
  execFileSync(command, commandArgs, { cwd: repo, env, input, encoding: 'utf8', timeout: AGENT_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] })
const continuum = (...commandArgs) => run('npx', ['-y', PACKAGE, ...commandArgs])

const FILES = {
  'package.json': `${JSON.stringify({ name: 'pricing', private: true, scripts: { test: 'node test.js' } }, null, 2)}\n`,
  'src/pricing.js': [
    '// Prices are in cents.',
    'exports.applyDiscount = (cents, percent) => cents + Math.round((cents * percent) / 100)',
    'exports.addTax = (cents, rate) => cents * rate',
    '',
  ].join('\n'),
  'test.js': [
    "const assert = require('node:assert')",
    "const { applyDiscount, addTax } = require('./src/pricing')",
    '',
    'assert.strictEqual(applyDiscount(1000, 10), 900)',
    'assert.strictEqual(addTax(1000, 0.08), 1080)',
    "console.log('2 tests passed')",
    '',
  ].join('\n'),
}

export const PROMPTS = {
  claude:
    'src/pricing.js has two bugs. Track the fix as a Continuum task, one step per bug. Fix applyDiscount only and run npm test, record your progress and the next action, then stop: another agent will take over. Reply in one sentence.',
  codex: 'Continue the task from your Continuum briefing. When the tests pass, mark the task completed. Reply in one sentence.',
}

/**
 * The work directory is deleted and rebuilt, so only one that is new, empty, or
 * a previous capture's (it holds capture.json) is accepted, never one of yours.
 */
function assertDisposable(dir) {
  const isPrecious = [process.cwd(), homedir(), '/'].some((precious) => precious === dir || precious.startsWith(`${dir}/`))
  const isOurs = !existsSync(dir) || readdirSync(dir).length === 0 || existsSync(join(dir, 'capture.json'))
  if (isPrecious || !isOurs) throw new Error(`Refusing to use ${dir} as the work directory: it is deleted and rebuilt. Pick a new directory.`)
}

assertDisposable(work)
rmSync(work, { recursive: true, force: true })
mkdirSync(join(repo, 'src'), { recursive: true })
for (const [path, text] of Object.entries(FILES)) writeFileSync(join(repo, path), text)
run('git', ['init', '-q'])
run('git', ['-c', 'user.name=Demo', '-c', 'user.email=demo@example.invalid', 'add', '-A'])
run('git', ['-c', 'user.name=Demo', '-c', 'user.email=demo@example.invalid', 'commit', '-qm', 'Pricing helpers'])

const capture = { package: PACKAGE, prompts: PROMPTS, steps: [] }
const step = (name, command, output) => {
  capture.steps.push({ name, command, output: output.trimEnd() })
  console.log(`\n$ ${command}\n${output.trimEnd()}`)
}

step('setup-claude', `npx ${PACKAGE.replace('@0.1.0', '')} setup claude-code`, continuum('setup', 'claude-code'))
step('setup-codex', `npx ${PACKAGE.replace('@0.1.0', '')} setup codex`, continuum('setup', 'codex'))
// 0.1.0's setup scans before writing its own files; one scan records them before any session starts.
continuum('scan')
// Claude Code asks before using a project's MCP server; approve it for this sample repository only.
const settingsPath = join(repo, '.claude/settings.local.json')
writeFileSync(settingsPath, JSON.stringify({ ...JSON.parse(readFileSync(settingsPath, 'utf8')), enabledMcpjsonServers: ['continuum'] }, null, 2))

console.log('\nClaude Code is working…')
const claudeReply = run('claude', ['-p', PROMPTS.claude, '--allowedTools', 'Read', 'Edit', 'Bash(npm test)', 'mcp__continuum__start_task', 'mcp__continuum__update_task'])
step('claude', `claude -p "${PROMPTS.claude}"`, claudeReply)

step('handoff-before-codex', 'npx @pranavoar/continuum handoff', continuum('handoff'))

console.log('\nCodex is working…')
const lastMessage = join(work, 'codex-last-message.txt')
run('codex', [
  'exec', ...(codexModel ? ['-m', codexModel] : []), '-C', repo, '-s', 'workspace-write',
  '-c', `projects."${repo}".trust_level="trusted"`, '--dangerously-bypass-hook-trust', '-o', lastMessage, PROMPTS.codex,
])
step('codex', `codex exec "${PROMPTS.codex}"`, readFileSync(lastMessage, 'utf8'))

step('verified-run', 'npx @pranavoar/continuum run -- npm test', continuum('run', '--', 'npm', 'test'))
step('handoff-after', 'npx @pranavoar/continuum handoff', continuum('handoff'))
step('final-code', 'cat src/pricing.js', readFileSync(join(repo, 'src/pricing.js'), 'utf8'))

writeFileSync(join(work, 'capture.json'), `${JSON.stringify(capture, null, 2)}\n`)
console.log(`\nSaved ${join(work, 'capture.json')}; the repository is kept at ${repo}.`)
