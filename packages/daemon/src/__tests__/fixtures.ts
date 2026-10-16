import { Writable } from 'node:stream'
import { initWorkspace, runCheck, scanRepository } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import type { ContinuumEvent } from '@continuum/core'
import { ContextStore } from '@continuum/store'

const silent = () => new Writable({ write: (_chunk, _encoding, done) => done() })

function at(minute: number): string {
  return new Date(Date.UTC(2026, 9, 16, 11, minute)).toISOString()
}

export const NOW = new Date(Date.UTC(2026, 9, 16, 12, 0))

/**
 * A repository with a baseline scan, one Claude Code session that edited a file
 * and left a note, a passing and a failing check, and an anchored decision.
 */
export async function seededRepo(): Promise<{ repo: Sandbox; storePath: string }> {
  const repo = createSandbox({ 'package.json': '{}', 'tsconfig.json': '{}', 'src/auth.ts': 'auth v1', 'src/db.ts': 'db v1', 'README.md': 'readme' })
  repo.commit('initial')
  const { store, workspace } = await initWorkspace(repo.root)
  await scanRepository(store, repo.root, { now: () => new Date(at(0)) })

  repo.write('src/auth.ts', 'auth v2')
  const authHash = repo.git('hash-object', 'src/auth.ts')
  const events: ContinuumEvent[] = [
    { type: 'session.started', payload: { sessionId: 's1', agent: 'claude-code' }, evidence: 'observed', source: 'adapter:claude-code', occurredAt: at(10) },
    { type: 'file.changed', payload: { path: 'src/auth.ts', contentHash: authHash, changeType: 'modified', sessionId: 's1' }, evidence: 'observed', source: 'adapter:claude-code', occurredAt: at(12) },
    { type: 'session.progress', payload: { sessionId: 's1', note: 'Auth now hashes passwords. Next: rate limiting.' }, evidence: 'agent-reported', source: 'adapter:claude-code', occurredAt: at(14) },
  ]
  store.recordAll(events)
  await runCheck(store, { root: repo.root, command: process.execPath, args: ['-e', '0'], name: 'unit', stdout: silent(), stderr: silent(), now: () => new Date(at(20)) })
  await runCheck(store, { root: repo.root, command: process.execPath, args: ['-e', 'process.exit(1)'], name: 'lint', stdout: silent(), stderr: silent(), now: () => new Date(at(21)) })
  store.record({
    type: 'memory.recorded',
    payload: { id: 'd1', kind: 'decision', title: 'Passwords use argon2', body: 'Never bcrypt.', anchors: { 'file:src/db.ts': repo.git('hash-object', 'src/db.ts') } },
    evidence: 'agent-reported',
    source: 'mcp',
    occurredAt: at(25),
  })
  store.record({ type: 'session.ended', payload: { sessionId: 's1' }, evidence: 'observed', source: 'adapter:claude-code', occurredAt: at(30) })
  store.close()
  return { repo, storePath: workspace.storePath }
}

export function openStore(path: string): ContextStore {
  return ContextStore.open(path)
}
