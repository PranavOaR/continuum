// Times opening a store with a long history: every hook opens the store and loads its whole graph.
//   npx tsx scripts/bench-store.ts [events=100000] [files=2000]
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ContinuumEvent } from '../packages/core/src'
import { ContextStore } from '../packages/store/src'

const EVENTS = Number(process.argv[2] ?? 100_000)
const FILES = Number(process.argv[3] ?? 2_000)
/** Events per session: a long working session's edits and notes. */
const PER_SESSION = 200
const BATCH = 1_000
const RUNS = 3
const START = Date.UTC(2026, 0, 1)
const MINUTE = 60_000

const hash = (seed: number) => seed.toString(16).padStart(40, '0')

/** A plausible history: sessions of file edits with a progress note now and then. */
function eventAt(index: number): ContinuumEvent {
  const sessionId = `session-${Math.floor(index / PER_SESSION)}`
  const occurredAt = new Date(START + index * MINUTE).toISOString()
  const base = { evidence: 'observed' as const, source: 'adapter:claude-code', occurredAt }
  if (index % PER_SESSION === 0) return { ...base, type: 'session.started', payload: { sessionId, agent: 'claude-code' } }
  if (index % 20 === 0) return { ...base, type: 'session.progress', evidence: 'agent-reported', payload: { sessionId, note: `Step ${index} done; next, the tests.` } }
  const path = `src/module${index % FILES}.ts`
  return { ...base, type: 'file.changed', payload: { path, contentHash: hash(index), changeType: 'modified', sessionId } }
}

function best(work: () => void): number {
  const times: number[] = []
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now()
    work()
    times.push(performance.now() - started)
  }
  return Math.min(...times)
}

const dir = mkdtempSync(join(tmpdir(), 'continuum-bench-store-'))
const path = join(dir, 'context.db')
try {
  const writer = ContextStore.open(path)
  for (let start = 0; start < EVENTS; start += BATCH) {
    writer.recordAll(Array.from({ length: Math.min(BATCH, EVENTS - start) }, (_, offset) => eventAt(start + offset)))
  }
  writer.close()

  const open = best(() => ContextStore.open(path).close())
  // What one hook costs the store: open, record an edit, close.
  let next = EVENTS
  const hook = best(() => {
    const store = ContextStore.open(path)
    store.record(eventAt(next++))
    store.close()
  })
  console.log(`${EVENTS} events, ${FILES} files: open best ${open.toFixed(0)} ms, one hook's open-record-close best ${hook.toFixed(0)} ms over ${RUNS} runs`)

  // `continuum compact` folds old events into a checkpoint; this is what it buys.
  const store = ContextStore.open(path)
  store.compact(new Date(START + (EVENTS - PER_SESSION) * MINUTE))
  store.close()
  console.log(`after compact: open best ${best(() => ContextStore.open(path).close()).toFixed(0)} ms`)
} finally {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
}
