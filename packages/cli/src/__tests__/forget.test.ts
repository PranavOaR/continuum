import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_OK, EXIT_USAGE } from '../io'
import { cli } from './harness'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

describe('continuum forget', () => {
  it('removes a file from the record and from the database file itself', async () => {
    const repo = createSandbox({ 'notes/salary-review.md': 'private', 'src/app.ts': 'a' })
    sandboxes.push(repo)
    await cli(repo.root, ['init'])
    const result = await cli(repo.root, ['forget', '--path', 'notes/'])
    expect(result.code).toBe(EXIT_OK)
    expect(result.out).toContain('Forgot everything about notes/')
    expect(readFileSync(join(repo.root, '.continuum/context.db')).toString('latin1')).not.toContain('salary-review')
    expect((await cli(repo.root, ['forget', '--path', 'notes/'])).out).toContain('Nothing recorded matches')
  })

  it('explains its options', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    await cli(repo.root, ['init'])
    expect((await cli(repo.root, ['forget'])).code).toBe(EXIT_USAGE)
    expect((await cli(repo.root, ['forget', '--before', 'last week'])).code).toBe(EXIT_USAGE)
  })
})
