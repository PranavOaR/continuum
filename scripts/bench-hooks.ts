// Times what an agent session actually waits for, through the release bundle the plugin runs:
// the SessionStart briefing and the capture of one file edit, end to end (a new `node` process per hook,
// as Claude Code starts it), and the same briefing built in process. The website's numbers come from here.
//   npm run build && npm run bundle && npx tsx scripts/bench-hooks.ts [events=10000] [files=2000]
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, platform, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ContinuumEvent } from '../packages/core/src'
import { readWorkingTreeWithSymbols } from '../packages/capture/src'
import { projectState, renderHandoff } from '../packages/context/src'
import { ContextStore } from '../packages/store/src'

const EVENTS = Number(process.argv[2] ?? 10_000)
const FILES = Number(process.argv[3] ?? 2_000)
const RUNS = 21
const PER_DIR = 200
/** Events per session: a long working session's edits and notes. */
const PER_SESSION = 200
const BATCH = 1_000
const START = Date.UTC(2026, 9, 1)
const MINUTE = 60_000
const BUNDLE = resolve('dist/release/continuum.js')

if (!existsSync(BUNDLE)) {
  console.error('Build the release bundle first: npm run build && npm run bundle')
  process.exit(1)
}

const fileAt = (index: number) => `pkg${Math.floor(index / PER_DIR)}/file${index}.ts`

/** A plausible history: sessions of edits, progress notes, test runs and decisions. */
function eventAt(index: number): ContinuumEvent {
  const sessionId = `session-${Math.floor(index / PER_SESSION)}`
  const occurredAt = new Date(START + index * MINUTE).toISOString()
  const base = { evidence: 'observed' as const, source: 'adapter:claude-code', occurredAt }
  if (index % PER_SESSION === 0) return { ...base, type: 'session.started', payload: { sessionId, agent: index % 400 === 0 ? 'claude-code' : 'codex' } }
  if (index % 50 === 0) return { ...base, type: 'check.recorded', evidence: 'verified', payload: { name: 'tests', command: 'npm test', exitCode: 0, durationMs: 4_000, ranAgainst: { [`file:${fileAt(index % FILES)}`]: 'stale' } } }
  if (index % 97 === 0) return { ...base, type: 'memory.recorded', evidence: 'agent-reported', payload: { id: `decision-${index}`, kind: 'decision', title: `Decision ${index}`, body: 'Why it was made.', anchors: {} } }
  if (index % 20 === 0) return { ...base, type: 'session.progress', evidence: 'agent-reported', payload: { sessionId, note: `Step ${index} done; next, the tests.` } }
  return { ...base, type: 'file.changed', payload: { path: fileAt(index % FILES), contentHash: index.toString(16).padStart(40, '0'), changeType: 'modified', sessionId } }
}

function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function timeAsync(work: () => Promise<unknown>): Promise<number> {
  const times: number[] = []
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now()
    await work()
    times.push(performance.now() - started)
  }
  return median(times)
}

function timeSync(work: () => void): number {
  const times: number[] = []
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now()
    work()
    times.push(performance.now() - started)
  }
  return median(times)
}

/** One hook as Claude Code runs it: a fresh `node` process reading the payload on stdin. */
function hook(root: string, payload: Record<string, unknown>): string {
  const result = spawnSync(process.execPath, [BUNDLE, 'ingest'], { cwd: root, input: JSON.stringify({ cwd: root, transcript_path: '/bench.jsonl', ...payload }), encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`hook failed: ${result.stderr}`)
  return result.stdout
}

const root = mkdtempSync(join(tmpdir(), 'continuum-bench-hooks-'))
const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=bench', '-c', 'user.email=bench@example.invalid', ...args], { cwd: root, stdio: 'ignore' })
try {
  git('init', '-q')
  for (let index = 0; index < FILES; index += 1) {
    if (index % PER_DIR === 0) mkdirSync(join(root, `pkg${index / PER_DIR}`))
    writeFileSync(join(root, fileAt(index)), `export function value${index}() {\n  return ${index}\n}\n`)
  }
  git('add', '-A')
  git('commit', '-qm', 'bench')
  execFileSync(process.execPath, [BUNDLE, 'setup', 'claude-code'], { cwd: root, stdio: 'ignore' })

  const writer = ContextStore.open(join(root, '.continuum/context.db'))
  for (let start = 0; start < EVENTS; start += BATCH) writer.recordAll(Array.from({ length: Math.min(BATCH, EVENTS - start) }, (_, offset) => eventAt(start + offset)))
  writer.close()

  const now = new Date(START + EVENTS * MINUTE)
  const inProcess = await timeAsync(async () => {
    const store = ContextStore.open(join(root, '.continuum/context.db'))
    try {
      renderHandoff(projectState(store, await readWorkingTreeWithSymbols(store, root), now), { now })
    } finally {
      store.close()
    }
  })
  let session = 0
  const sessionStart = timeSync(() => {
    // A hook that quietly did nothing would look fast: every run must return the briefing.
    const output = hook(root, { session_id: `bench-${session++}`, hook_event_name: 'SessionStart', source: 'startup' })
    if (!output.includes('additionalContext') || !output.includes('Continuum')) throw new Error(`SessionStart returned no briefing: ${output.slice(0, 200)}`)
  })
  let edit = 0
  const fileEdit = timeSync(() => {
    const path = fileAt(edit % FILES)
    writeFileSync(join(root, path), `export const edited = ${edit++}\n`)
    hook(root, { session_id: 'bench-edit', hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(root, path) } })
  })
  const events = (() => {
    const store = ContextStore.open(join(root, '.continuum/context.db'))
    try {
      return store.eventCount()
    } finally {
      store.close()
    }
  })()
  // Each edit hook must have recorded its change.
  if (events < EVENTS + RUNS * 2) throw new Error(`expected the hooks to record at least ${RUNS * 2} events, store has ${events - EVENTS}`)
  // The bare cost of starting the bundle, which every end-to-end number includes.
  const startup = timeSync(() => execFileSync(process.execPath, [BUNDLE, '--version'], { stdio: 'ignore' }))

  const results = {
    measuredAt: new Date().toISOString().slice(0, 10),
    machine: `${cpus()[0]?.model ?? 'unknown CPU'}, ${platform()} ${release()}, Node.js ${process.versions.node}`,
    repository: { files: FILES, events: EVENTS },
    runs: RUNS,
    medianMs: {
      briefingInProcess: Math.round(inProcess),
      briefingEndToEnd: Math.round(sessionStart),
      editCaptureEndToEnd: Math.round(fileEdit),
      bundleStartup: Math.round(startup),
    },
  }
  console.log(JSON.stringify(results, null, 2))
} finally {
  rmSync(root, { recursive: true, force: true, maxRetries: 5 })
}
