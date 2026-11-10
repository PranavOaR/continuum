import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_PREFERENCE_CHARS, MAX_PREFERENCES } from '@continuum/core'
import { afterEach, describe, expect, it } from 'vitest'
import { briefingPreferences, InvalidProfileError, PROFILE_FILE, readProfile, writeProfile } from '../profile'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function configDir() {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-profile-'))
  dirs.push(dir)
  return dir
}

describe('profile', () => {
  it('is empty until you write one', async () => {
    expect(await readProfile(configDir())).toEqual({ preferences: [] })
  })

  it('stores preferences one line each, without blanks or repeats, in a file only you can read', async () => {
    const dir = configDir()
    const saved = await writeProfile(dir, ['  Use pnpm,\n never npm ', '', 'Use pnpm, never npm', 'Ask before pushing'])
    expect(saved).toEqual({ preferences: ['Use pnpm, never npm', 'Ask before pushing'] })
    expect(await readProfile(dir)).toEqual(saved)
    expect(JSON.parse(readFileSync(join(dir, PROFILE_FILE), 'utf8'))).toEqual({ version: 1, preferences: ['Use pnpm, never npm', 'Ask before pushing'] })
    // Windows has no permission bits; the user's own folder is private there.
    if (process.platform !== 'win32') expect(statSync(join(dir, PROFILE_FILE)).mode & 0o777).toBe(0o600)
  })

  it('creates the folder when it is missing', async () => {
    const dir = join(configDir(), 'nested', 'continuum')
    await writeProfile(dir, ['Use pnpm'])
    expect((await readProfile(dir)).preferences).toEqual(['Use pnpm'])
  })

  it('masks a secret before it is written', async () => {
    const dir = configDir()
    const saved = await writeProfile(dir, ['Deploy with AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'])
    expect(saved.preferences[0]).toContain('[redacted]')
    expect(readFileSync(join(dir, PROFILE_FILE), 'utf8')).not.toContain('wJalrXUtnFEMI')
  })

  it('refuses too many preferences, one that is too long, or one that is not text, and keeps what was there', async () => {
    const dir = configDir()
    await writeProfile(dir, ['Use pnpm'])
    await expect(writeProfile(dir, Array.from({ length: MAX_PREFERENCES + 1 }, (_, index) => `Preference ${index}`))).rejects.toThrow(`at most ${MAX_PREFERENCES}`)
    await expect(writeProfile(dir, ['x'.repeat(MAX_PREFERENCE_CHARS + 1)])).rejects.toThrow(InvalidProfileError)
    await expect(writeProfile(dir, [42 as unknown as string])).rejects.toThrow('must be text')
    expect((await readProfile(dir)).preferences).toEqual(['Use pnpm'])
  })

  it('names the file when it cannot be used', async () => {
    const dir = configDir()
    writeFileSync(join(dir, PROFILE_FILE), '{ "preferences": ')
    await expect(readProfile(dir)).rejects.toThrow(/Cannot read .*profile\.json/)
    writeFileSync(join(dir, PROFILE_FILE), '{ "preferences": "Use pnpm" }')
    await expect(readProfile(dir)).rejects.toThrow('must hold a "preferences" list')
  })
})

describe('briefingPreferences', () => {
  it("gives your preferences masked by the repository's rules", async () => {
    const dir = configDir()
    await writeProfile(dir, ['Customer ACME-123456 reviews every release'])
    expect(await briefingPreferences(dir, (text) => text.replace(/ACME-\d{6}/, '[redacted]'))).toEqual(['Customer [redacted] reviews every release'])
  })

  it('gives none without a config folder, or when the file cannot be used, instead of failing the briefing', async () => {
    const dir = configDir()
    writeFileSync(join(dir, PROFILE_FILE), 'not json')
    expect(await briefingPreferences(dir, (text) => text)).toEqual([])
    expect(await briefingPreferences(undefined, (text) => text)).toEqual([])
  })
})
