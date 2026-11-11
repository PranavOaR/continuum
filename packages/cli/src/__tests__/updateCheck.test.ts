import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isNewer, setUpdateCheck, startUpdateCheck, UPDATE_CHECK_FILE, type UpdateCheckOptions } from '../updateCheck'

const NOW = new Date('2026-11-11T12:00:00.000Z')
const HOUR = 3_600_000
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function configDir() {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-update-'))
  dirs.push(dir)
  return dir
}

/** A check as a person at a terminal would get it, asking a registry that answers `latest`. */
function options(overrides: Partial<UpdateCheckOptions> = {}): UpdateCheckOptions & { asked: number } {
  const state = { asked: 0 }
  return Object.assign(state, {
    version: '0.5.0',
    packageName: 'getcontinuum',
    configDir: configDir(),
    env: {},
    isInteractive: true,
    command: 'status',
    now: () => NOW,
    fetchLatest: async () => {
      state.asked += 1
      return '0.6.0'
    },
    ...overrides,
  })
}

describe('isNewer', () => {
  it('compares versions number by number', () => {
    expect(isNewer('0.6.0', '0.5.0')).toBe(true)
    expect(isNewer('0.10.0', '0.9.3')).toBe(true)
    expect(isNewer('1.0.0', '0.99.99')).toBe(true)
    expect(isNewer('0.5.0', '0.5.0')).toBe(false)
    expect(isNewer('0.4.9', '0.5.0')).toBe(false)
    expect(isNewer('not-a-version', '0.5.0')).toBe(false)
  })
})

describe('the update notice', () => {
  it('names the new version and the command that updates, after asking the registry once', async () => {
    const check = options()
    expect(await startUpdateCheck(check).finish()).toBe('Update available: Continuum 0.5.0 → 0.6.0. Run: npx getcontinuum@latest update')
    expect(check.asked).toBe(1)
    expect(JSON.parse(readFileSync(join(check.configDir, UPDATE_CHECK_FILE), 'utf8'))).toMatchObject({ checkedAt: NOW.toISOString(), latest: '0.6.0' })
  })

  it('asks the registry at most once a day, and still shows what it learned', async () => {
    const check = options()
    await startUpdateCheck(check).finish()
    const later = { ...check, now: () => new Date(NOW.getTime() + 5 * HOUR) }
    expect(await startUpdateCheck(later).finish()).toContain('0.6.0')
    expect(check.asked).toBe(1)
    await startUpdateCheck({ ...check, now: () => new Date(NOW.getTime() + 25 * HOUR) }).finish()
    expect(check.asked).toBe(2)
  })

  it('says nothing when the running version is the latest', async () => {
    expect(await startUpdateCheck(options({ version: '0.6.0' })).finish()).toBeNull()
  })

  it('never asks for agents, pipes, CI, a checkout, or the commands agents run', async () => {
    for (const overrides of [
      { isInteractive: false },
      { env: { CI: 'true' } },
      { env: { NO_UPDATE_NOTIFIER: '1' } },
      { env: { CONTINUUM_NO_UPDATE_CHECK: '1' } },
      { version: '0.0.0-dev' },
      { command: 'mcp' },
      { command: 'ingest' },
      { command: 'update' },
    ] satisfies Partial<UpdateCheckOptions>[]) {
      const check = options(overrides)
      expect(await startUpdateCheck(check).finish()).toBeNull()
      expect(check.asked).toBe(0)
    }
  })

  it('is off once turned off, and on again once turned on', async () => {
    const check = options()
    await setUpdateCheck(check.configDir, false)
    expect(await startUpdateCheck(check).finish()).toBeNull()
    expect(check.asked).toBe(0)
    await setUpdateCheck(check.configDir, true)
    expect(await startUpdateCheck(check).finish()).toContain('0.6.0')
  })

  it('never fails or holds up the command: a registry that errors or hangs is skipped', async () => {
    const failing = options({ fetchLatest: async () => Promise.reject(new Error('offline')) })
    expect(await startUpdateCheck(failing).finish()).toBeNull()
    // A failed check still counts as today's, so an offline machine does not try on every command.
    expect(existsSync(join(failing.configDir, UPDATE_CHECK_FILE))).toBe(true)
    const hanging = options({ fetchLatest: () => new Promise<string>(() => {}) })
    const started = Date.now()
    expect(await startUpdateCheck({ ...hanging, waitMs: 50 }).finish()).toBeNull()
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('ignores a cache file it cannot read, and an answer that is not a version', async () => {
    const check = options({ fetchLatest: async () => '<html>' })
    writeFileSync(join(check.configDir, UPDATE_CHECK_FILE), 'not json')
    expect(await startUpdateCheck(check).finish()).toBeNull()
  })
})
