import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { selfInvocation, stableNodePath } from '../invocation'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function layout() {
  const root = mkdtempSync(join(tmpdir(), 'continuum-node-'))
  dirs.push(root)
  const versioned = join(root, 'Cellar/node/26.7.0/bin')
  const stableBin = join(root, 'bin')
  const otherBin = join(root, 'other')
  for (const dir of [versioned, stableBin, otherBin]) mkdirSync(dir, { recursive: true })
  writeFileSync(join(versioned, 'node'), '')
  writeFileSync(join(otherBin, 'node'), '')
  symlinkSync(join(versioned, 'node'), join(stableBin, 'node'))
  return { execPath: join(versioned, 'node'), stableBin, otherBin }
}

describe('stableNodePath', () => {
  it('prefers a PATH entry that resolves to the running node', () => {
    const { execPath, stableBin, otherBin } = layout()
    expect(stableNodePath(execPath, [otherBin, stableBin].join(delimiter))).toBe(join(stableBin, 'node'))
  })

  it('keeps the exact path when no PATH node is the same binary', () => {
    const { execPath, otherBin } = layout()
    expect(stableNodePath(execPath, otherBin)).toBe(execPath)
    expect(stableNodePath(execPath, undefined)).toBe(execPath)
  })
})

describe('selfInvocation', () => {
  it('runs this CLI through the tsx loader', () => {
    const { command, args } = selfInvocation()
    expect(command).toMatch(/node/)
    expect(args[0]).toBe('--import')
    expect(args[1]).toMatch(/^file:.*tsx/)
    expect(args[2]).toMatch(/packages\/cli\/src\/bin\.ts$/)
  })
})
