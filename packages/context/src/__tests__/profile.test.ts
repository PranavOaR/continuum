import { describe, expect, it } from 'vitest'
import { renderHandoff } from '../handoff'
import { profileOf } from '../profile'
import { projectState } from '../projectState'
import { CURRENT_FILES, NOW, seededStore, tree } from './fixtures'

const sectionOf = (text: string, heading: string) => {
  const start = text.indexOf(`## ${heading}`)
  if (start === -1) return ''
  const next = text.indexOf('\n## ', start + 1)
  return text.slice(start, next === -1 ? undefined : next)
}

describe('profileOf', () => {
  it('names the stack and package manager from root files only, and the checks that pass now', () => {
    const profile = profileOf(['package.json', 'tsconfig.json', 'pnpm-lock.yaml', 'package-lock.json', 'docs/Cargo.toml'], [
      { name: 'unit', command: 'pnpm test', previousCommand: null, status: 'passed', exitCode: 0, ranAt: null, changed: [], evidence: 'verified' },
      { name: 'e2e', command: 'pnpm e2e', previousCommand: null, status: 'out-of-date', exitCode: 0, ranAt: null, changed: ['a.ts'], evidence: 'verified' },
    ])
    expect(profile).toEqual({ stack: ['Node.js', 'TypeScript'], packageManager: { name: 'pnpm', lockfile: 'pnpm-lock.yaml' }, passing: [{ name: 'unit', command: 'pnpm test', evidence: 'verified' }] })
  })
})

describe('the project profile in a briefing', () => {
  it('opens with what the repository is built with and the commands that pass on it now', () => {
    const files = { ...CURRENT_FILES, 'package.json': 'h-pkg', 'tsconfig.json': 'h-ts', 'package-lock.json': 'h-lock' }
    const text = renderHandoff(projectState(seededStore(), tree(files), NOW), { now: NOW })
    const profile = sectionOf(text, 'Project profile')
    expect(profile).toContain('[observed] Stack: Node.js, TypeScript. Package manager: npm (`package-lock.json`).')
    expect(profile).toContain('[verified] Pass on the code as it is now: `npm test`.')
    // e2e failed, so it is not offered as a command that passes.
    expect(profile).not.toContain('npm run e2e')
    expect(text.indexOf('## Project profile')).toBeLessThan(text.indexOf('## Where we left off'))
  })

  it('is left out when there is nothing to say', () => {
    const text = renderHandoff(projectState(seededStore(), tree({ 'notes.txt': 'h' }), NOW), { now: NOW })
    expect(text).not.toContain('## Project profile')
  })
})
