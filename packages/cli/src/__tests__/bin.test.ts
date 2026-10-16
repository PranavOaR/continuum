import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'

const BIN = fileURLToPath(new URL('../bin.ts', import.meta.url))
/** Absolute loader URL, because `--import tsx` would resolve from the sandbox's cwd. */
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href
const sandboxes: Sandbox[] = []

afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

function continuum(cwd: string, ...args: string[]) {
  return execFileSync(process.execPath, ['--import', TSX_LOADER, BIN, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

describe('continuum binary', () => {
  it('runs as a real process against a sandbox repository', () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    expect(continuum(repo.root, '--version').trim()).toBe('0.0.0')
    expect(continuum(repo.root, 'init')).toContain('Initialized Continuum')
    expect(continuum(repo.root, 'status')).toContain('1 tracked file · all recorded')
  }, 20_000)
})
