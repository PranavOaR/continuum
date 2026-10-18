import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from '../io'
import { cli } from './harness'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

async function repo() {
  const created = createSandbox({ 'src/app.ts': 'a', 'README.md': 'r' })
  sandboxes.push(created)
  await cli(created.root, ['init'])
  return created
}

describe('continuum session', () => {
  it('records a Codex session: its edits, its note and its summary, for the next agent', async () => {
    const created = await repo()
    created.write('README.md', 'edited before the session')
    const started = await cli(created.root, ['session', 'start', '--agent', 'codex'])
    expect(started.code).toBe(EXIT_OK)
    expect(started.out).toContain('Started a codex session')
    expect(started.out).toContain('# Continuum handoff')

    created.write('src/app.ts', 'edited by codex')
    expect((await cli(created.root, ['session', 'note', 'Refactored', 'the', 'app'])).code).toBe(EXIT_OK)
    expect((await cli(created.root, ['session', 'end', '--summary', 'App refactored; tests next'])).out).toMatch(/Ended codex-\w+; recorded 1 last change/)
    expect((await cli(created.root, ['session'])).out).toBe('No session is open.')

    const handoff = (await cli(created.root, ['handoff'])).out
    expect(handoff).toContain('`codex` session')
    expect(handoff).toContain('Files it changed: `src/app.ts`')
    expect(handoff).toContain('App refactored; tests next')
    // The edit made before the session is not credited to it.
    expect(handoff).not.toMatch(/Files it changed:[^\n]*README\.md/)
  })

  it('opens one session at a time and checks its options', async () => {
    const created = await repo()
    expect((await cli(created.root, ['session', 'start', '--agent', 'robot'])).code).toBe(EXIT_USAGE)
    expect((await cli(created.root, ['session', 'start', '--agent', 'cursor', '--task', 'missing'])).code).toBe(EXIT_FAILURE)
    expect((await cli(created.root, ['session', 'note', 'x'])).code).toBe(EXIT_FAILURE)
    await cli(created.root, ['session', 'start', '--agent', 'cursor'])
    expect((await cli(created.root, ['session', 'start', '--agent', 'codex'])).err).toContain('already open')
    expect((await cli(created.root, ['session'])).out).toMatch(/Open: cursor session cursor-\w+/)
  })
})
