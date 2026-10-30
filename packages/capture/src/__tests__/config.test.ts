import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, InvalidConfigError, readConfig, repositoryRedactor, updateConfig } from '../config'
import { createSandbox, type Sandbox } from '../testing'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) sandbox.cleanup()
})

function repoWithConfig(content?: string): string {
  const sandbox = createSandbox({ 'a.txt': 'a' })
  sandboxes.push(sandbox)
  mkdirSync(join(sandbox.root, '.continuum'), { recursive: true })
  if (content !== undefined) writeFileSync(join(sandbox.root, '.continuum/config.json'), content)
  return sandbox.root
}

const configText = (root: string) => readFileSync(join(root, '.continuum/config.json'), 'utf8')

describe('readConfig', () => {
  it('uses the defaults when there is no config file', async () => {
    expect(await readConfig(repoWithConfig())).toEqual(DEFAULT_CONFIG)
  })

  it.each([
    ['malformed JSON', '{ "redactPatterns": ["CUST-[0-9]+"], }'],
    ['a value that is not an object', '["CUST-[0-9]+"]'],
    ['patterns that are not a list of strings', '{ "redactPatterns": "CUST-[0-9]+" }'],
    ['a setting that is not true or false', '{ "capturePrompts": "yes" }'],
  ])('refuses %s instead of quietly using the defaults', async (_case, content) => {
    await expect(readConfig(repoWithConfig(content))).rejects.toThrow(InvalidConfigError)
  })
})

describe('updateConfig', () => {
  it('keeps the redaction patterns and any other keys when it changes a setting', async () => {
    const root = repoWithConfig(JSON.stringify({ redactPatterns: ['CUST-[0-9]+'], note: 'kept' }))
    await updateConfig(root, { capturePrompts: true })
    expect(JSON.parse(configText(root))).toEqual({ ...DEFAULT_CONFIG, redactPatterns: ['CUST-[0-9]+'], note: 'kept', capturePrompts: true })
  })

  it('never writes over a config it cannot read', async () => {
    const broken = '{ "redactPatterns": ["CUST-[0-9]+"], }'
    const root = repoWithConfig(broken)
    await expect(updateConfig(root, { capturePrompts: true })).rejects.toThrow(InvalidConfigError)
    expect(configText(root)).toBe(broken)
  })
})

describe('repositoryRedactor', () => {
  it('applies the repository’s own patterns', async () => {
    const redactor = await repositoryRedactor(repoWithConfig(JSON.stringify({ redactPatterns: ['CUST-[0-9]{5}'] })))
    expect(redactor.redact('customer CUST-12345')).toBe('customer [redacted]')
  })

  it('refuses to redact with an unreadable config, so nothing is stored unmasked', async () => {
    await expect(repositoryRedactor(repoWithConfig('{'))).rejects.toThrow(InvalidConfigError)
  })
})
