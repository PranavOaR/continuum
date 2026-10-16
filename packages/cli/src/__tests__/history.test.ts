import { rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { EXIT_FAILURE, EXIT_OK } from '../io'
import { cli } from './harness'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

describe('continuum export and import', () => {
  it('moves recorded history to another clone, privately', async () => {
    const source = createSandbox({ 'a.ts': 'a' })
    const target = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(source, target)
    await cli(source.root, ['init'])
    await cli(source.root, ['run', '--name', 'unit', '--', process.execPath, '-e', '0'])
    const file = join(source.root, '..', `${source.root.split('/').at(-1)}-export.json`)
    onTestFinished(() => rmSync(file, { force: true }))
    expect((await cli(source.root, ['export', file])).code).toBe(EXIT_OK)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect((await cli(source.root, ['export', file])).code).toBe(EXIT_FAILURE)

    expect((await cli(target.root, ['import', file])).code).toBe(EXIT_OK)
    expect((await cli(target.root, ['status'])).out).toContain('unit')
    expect((await cli(target.root, ['import', file])).err).toContain('already has history')
  })

  it("holds an imported history to this repository's ignore rules and redaction", async () => {
    const source = createSandbox({ 'private/notes.md': 'n', 'src/app.ts': 'a' })
    const target = createSandbox({ '.continuumignore': 'private/\n', 'src/app.ts': 'a' })
    sandboxes.push(source, target)
    await cli(source.root, ['init'])
    await cli(source.root, ['run', '--name', 'unit', '--', process.execPath, '-e', `console.log("CUST-12345")`])
    const file = join(source.root, '..', `${source.root.split('/').at(-1)}-export.json`)
    onTestFinished(() => rmSync(file, { force: true }))
    await cli(source.root, ['export', file])

    const { existsSync, writeFileSync, mkdirSync, readFileSync } = await import('node:fs')
    mkdirSync(join(target.root, '.continuum'), { recursive: true })
    writeFileSync(join(target.root, '.continuum/config.json'), JSON.stringify({ redactPatterns: ['CUST-[0-9]{5}'] }))
    expect((await cli(target.root, ['import', file])).code).toBe(EXIT_OK)
    const stored = ['', '-wal']
      .map((suffix) => join(target.root, `.continuum/context.db${suffix}`))
      .filter((path) => existsSync(path))
      .map((path) => readFileSync(path).toString('latin1'))
      .join('')
    expect(stored).not.toContain('private/notes.md')
    expect(stored).not.toContain('CUST-12345')
    const { setCustomRedactions } = await import('@continuum/capture')
    setCustomRedactions([])
  })
})
