// Writes the Claude Code plugin in plugin/ from the same hook and MCP
// definitions `continuum setup claude-code` uses, pinned to the CLI's version.
//   npx tsx scripts/plugin.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setupClaudeCode } from '../packages/claude-code/src/index'
import { createSandbox } from '../packages/capture/src/testing'

const ROOT = join(import.meta.dirname, '..')
const version = JSON.parse(readFileSync(join(ROOT, 'packages/cli/package.json'), 'utf8')).version as string
const invocation = { command: 'npx', args: ['-y', `@pranavoar/continuum@${version}`], portable: true }

/** The hooks and MCP server setup would write for the published package. */
export async function pluginFiles(): Promise<{ hooks: unknown; mcp: unknown; version: string }> {
  const sandbox = createSandbox({ 'a.txt': 'a' })
  try {
    await setupClaudeCode(sandbox.root, invocation)
    const settings = JSON.parse(readFileSync(join(sandbox.root, '.claude/settings.local.json'), 'utf8'))
    const mcp = JSON.parse(readFileSync(join(sandbox.root, '.mcp.json'), 'utf8'))
    return { hooks: { hooks: settings.hooks }, mcp, version }
  } finally {
    sandbox.cleanup()
  }
}

if (import.meta.main ?? process.argv[1]?.endsWith('plugin.ts')) {
  const { hooks, mcp } = await pluginFiles()
  const write = (path: string, value: unknown) => writeFileSync(join(ROOT, path), `${JSON.stringify(value, null, 2)}\n`)
  write('plugin/hooks/hooks.json', hooks)
  write('plugin/.mcp.json', mcp)
  const manifestPath = join(ROOT, 'plugin/.claude-plugin/plugin.json')
  write('plugin/.claude-plugin/plugin.json', { ...JSON.parse(readFileSync(manifestPath, 'utf8')), version })
  console.log(`Plugin written for @pranavoar/continuum@${version}`)
}
