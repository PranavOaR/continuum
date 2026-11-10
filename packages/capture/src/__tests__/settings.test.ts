import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readConfig } from '../config'
import { InvalidSettingsError, saveSettings } from '../settings'
import { createSandbox, type Sandbox } from '../testing'
import { initWorkspace } from '../workspace'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

async function repo() {
  const sandbox = createSandbox({ 'a.ts': 'a' })
  sandboxes.push(sandbox)
  ;(await initWorkspace(sandbox.root)).store.close()
  return sandbox.root
}

describe('saveSettings', () => {
  it('saves switches and patterns, keeping what the file already held', async () => {
    const root = await repo()
    writeFileSync(join(root, '.continuum', 'config.json'), JSON.stringify({ somethingNewer: 1 }))
    const saved = await saveSettings(root, { capturePrompts: true, redactPatterns: ['ACME-[0-9]{6}', 'ACME-[0-9]{6}'] })
    expect(saved).toEqual({ agentChecks: true, capturePrompts: true, receipts: true, redactPatterns: ['ACME-[0-9]{6}'] })
    expect(await readConfig(root)).toEqual(saved)
    expect(JSON.parse(readFileSync(join(root, '.continuum', 'config.json'), 'utf8')).somethingNewer).toBe(1)
  })

  it.each([
    ['will not compile', 'ACME-[0-9', 'not a valid regular expression'],
    ['could hang', '(a+)+$', 'repeats a group that itself repeats'],
    ['matches empty text', 'x*', 'matches empty text'],
  ])('refuses a pattern that %s, with the reason, and saves nothing', async (_name, pattern, reason) => {
    const root = await repo()
    await saveSettings(root, { redactPatterns: ['ACME-[0-9]{6}'] })
    await expect(saveSettings(root, { agentChecks: false, redactPatterns: ['ACME-[0-9]{6}', pattern] })).rejects.toThrow(reason)
    await expect(saveSettings(root, { redactPatterns: [pattern] })).rejects.toBeInstanceOf(InvalidSettingsError)
    expect(await readConfig(root)).toMatchObject({ agentChecks: true, redactPatterns: ['ACME-[0-9]{6}'] })
  })

  it('refuses to write over a config whose saved pattern could hang, naming it, as capture does', async () => {
    const root = await repo()
    writeFileSync(join(root, '.continuum', 'config.json'), JSON.stringify({ redactPatterns: ['\\w+\\w+\\w+\\w+@'] }))
    await expect(saveSettings(root, { receipts: false })).rejects.toThrow(/cannot be used .*two repeats in a row/i)
    await expect(readConfig(root)).rejects.toThrow(/two repeats in a row/i)
  })

  it('refuses unknown settings, wrong kinds and too many patterns', async () => {
    const root = await repo()
    await expect(saveSettings(root, { telemetry: true })).rejects.toThrow('Unknown setting: telemetry')
    await expect(saveSettings(root, { agentChecks: 'yes' })).rejects.toThrow('agentChecks must be on or off')
    await expect(saveSettings(root, { redactPatterns: 'ACME' })).rejects.toThrow('must be a list')
    await expect(saveSettings(root, { redactPatterns: Array.from({ length: 21 }, (_, index) => `P${index}-[0-9]+`) })).rejects.toThrow('at most 20')
  })
})
