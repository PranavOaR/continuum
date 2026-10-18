import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSandbox } from '@continuum/capture/testing'
import { describe, expect, it } from 'vitest'
import { setupClaudeCode } from '../setup'

const ROOT = join(__dirname, '../../../..')
const read = (path: string) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'))

describe('the Claude Code plugin', () => {
  it('registers exactly the hooks and MCP server that setup writes, pinned to the CLI version', async () => {
    const version = read('packages/cli/package.json').version
    const sandbox = createSandbox({ 'a.txt': 'a' })
    try {
      await setupClaudeCode(sandbox.root, { command: 'npx', args: ['-y', `@pranavoar/continuum@${version}`], portable: true })
      const settings = JSON.parse(readFileSync(join(sandbox.root, '.claude/settings.local.json'), 'utf8'))
      expect(read('plugin/hooks/hooks.json')).toEqual({ hooks: settings.hooks })
      expect(read('plugin/.mcp.json')).toEqual(JSON.parse(readFileSync(join(sandbox.root, '.mcp.json'), 'utf8')))
      expect(read('plugin/.claude-plugin/plugin.json').version).toBe(version)
    } finally {
      sandbox.cleanup()
    }
  })
})
