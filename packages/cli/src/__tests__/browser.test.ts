import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openInBrowser, type Launcher } from '../browser'

const LAUNCH = 'http://127.0.0.1:4747/app?token=secret-token-value'

/** Records what would be run instead of starting a real browser. */
function recording(outcome: 'spawn' | Error = 'spawn') {
  const runs: { command: string; args: readonly string[] }[] = []
  const launcher: Launcher = async (command, args) => {
    runs.push({ command, args })
    if (outcome !== 'spawn') throw outcome
  }
  return { runs, launcher }
}

describe('openInBrowser', () => {
  it('opens a private redirect page, so the access token never appears in a command line', async () => {
    const { runs, launcher } = recording()
    await openInBrowser(LAUNCH, { platform: 'darwin', launcher, cleanupAfterMs: 0 })

    expect(runs).toHaveLength(1)
    expect(runs[0].command).toBe('open')
    expect(JSON.stringify(runs[0].args)).not.toContain('secret-token-value')
    const page = runs[0].args[0]
    expect(page).toMatch(/\.html$/)
    expect(readFileSync(page, 'utf8')).toContain(`url=${LAUNCH}`)
    // Windows has no permission bits; its temp folder is private to the user.
    if (process.platform !== 'win32') {
      expect(statSync(page).mode & 0o777).toBe(0o600)
      expect(statSync(dirname(page)).mode & 0o777).toBe(0o700)
    }
  })

  it('opens the page with explorer.exe on Windows', async () => {
    const { runs, launcher } = recording()
    await openInBrowser(LAUNCH, { platform: 'win32', launcher, cleanupAfterMs: 0 })
    expect(runs[0].command).toBe('explorer.exe')
    expect(runs[0].args[0]).toMatch(/dashboard\.html$/)
  })

  it('removes the redirect page afterwards', async () => {
    const { runs, launcher } = recording()
    await openInBrowser(LAUNCH, { platform: 'linux', launcher, cleanupAfterMs: 1 })
    expect(runs[0].command).toBe('xdg-open')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(existsSync(runs[0].args[0])).toBe(false)
  })

  it('reports why it could not open one, and leaves nothing behind', async () => {
    const failed = recording(new Error('xdg-open was not found'))
    await expect(openInBrowser(LAUNCH, { platform: 'linux', launcher: failed.launcher, cleanupAfterMs: 0 })).rejects.toThrow('xdg-open was not found')
    expect(existsSync(failed.runs[0].args[0])).toBe(false)
    await expect(openInBrowser(LAUNCH, { platform: 'aix', launcher: recording().launcher })).rejects.toThrow(/aix/)
  })
})
