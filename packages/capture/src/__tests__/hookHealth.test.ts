import { afterEach, describe, expect, it } from 'vitest'
import { readHookHealth, recordHookArrival, recordHookFailure } from '../hookHealth'
import { createSandbox, type Sandbox } from '../testing'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) sandbox.cleanup()
})

function repo(): string {
  const sandbox = createSandbox({ 'a.txt': 'a' })
  sandboxes.push(sandbox)
  return sandbox.root
}

const at = (minute: number) => new Date(Date.UTC(2026, 9, 30, 12, minute))

describe('hook health', () => {
  it('knows nothing until a hook arrives', async () => {
    expect(await readHookHealth(repo(), 'codex')).toEqual({ lastArrivalAt: null, lastFailure: null, isFailing: false })
  })

  it('keeps the last arrival and the last failure per agent', async () => {
    const root = repo()
    await recordHookArrival(root, 'claude-code', at(1))
    await recordHookArrival(root, 'claude-code', at(2))
    await recordHookFailure(root, 'codex', at(3), 'git could not run')
    expect(await readHookHealth(root, 'claude-code')).toEqual({ lastArrivalAt: at(2).toISOString(), lastFailure: null, isFailing: false })
    expect(await readHookHealth(root, 'codex')).toEqual({ lastArrivalAt: null, lastFailure: { at: at(3).toISOString(), message: 'git could not run' }, isFailing: true })
  })

  it('is failing until a later hook arrives', async () => {
    const root = repo()
    await recordHookArrival(root, 'vscode', at(1))
    await recordHookFailure(root, 'vscode', at(1), 'config.json is not valid')
    expect((await readHookHealth(root, 'vscode')).isFailing).toBe(true)
    await recordHookArrival(root, 'vscode', at(2))
    expect((await readHookHealth(root, 'vscode')).isFailing).toBe(false)
  })
})
