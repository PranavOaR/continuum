import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { checkNode, runDoctor, type Finding } from '../doctor'
import { selfInvocation } from '../invocation'
import { EXIT_FAILURE, EXIT_OK } from '../io'
import { cli, TEST_CONFIG_DIR } from './harness'

const sandboxes: Sandbox[] = []
const dirs: string[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function sandbox() {
  const repo = createSandbox({ 'a.ts': 'a' })
  sandboxes.push(repo)
  return repo
}

const SETTINGS = '.claude/settings.local.json'
const readSettings = (root: string) => JSON.parse(readFileSync(join(root, SETTINGS), 'utf8'))
const writeSettings = (root: string, value: unknown) => writeFileSync(join(root, SETTINGS), JSON.stringify(value))

const doctor = (cwd: string, overrides: Partial<Parameters<typeof runDoctor>[0]> = {}) =>
  runDoctor({ cwd, nodeVersion: '24.1.0', invocation: selfInvocation(), webDist: '/nowhere', configDir: TEST_CONFIG_DIR, ...overrides })

const find = (findings: Finding[], label: RegExp) => findings.find((finding) => label.test(finding.label))

describe('checkNode', () => {
  it('requires a Node.js with node:sqlite unflagged', () => {
    expect(checkNode('22.13.0').status).toBe('ok')
    expect(checkNode('24.0.0').status).toBe('ok')
    expect(checkNode('22.12.1').status).toBe('fail')
    expect(checkNode('20.19.0').fix).toMatch(/22\.13/)
  })
})

describe('continuum doctor', () => {
  it('stops at the first missing prerequisite with the command that fixes it', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'continuum-doctor-'))
    dirs.push(outside)
    expect((await doctor(outside)).at(-1)).toMatchObject({ status: 'fail', label: 'Not inside a git repository' })
    const repo = sandbox()
    expect((await doctor(repo.root)).at(-1)).toMatchObject({ status: 'fail', fix: expect.stringContaining('continuum setup claude-code') })
  })

  it('passes a fresh setup and only warns that the MCP server awaits approval', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])
    const findings = await doctor(repo.root)
    expect(findings.filter((finding) => finding.status === 'fail')).toEqual([])
    expect(find(findings, /hooks registered/)?.status).toBe('ok')
    expect(find(findings, /not approved yet/)?.status).toBe('warn')
    expect(find(findings, /Dashboard/)?.status).toBe('warn')
    expect(find(findings, /continuum serve/)?.status).toBe('ok')
  })

  it('reports an approved or declined MCP server', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])
    writeSettings(repo.root, { ...readSettings(repo.root), enabledMcpjsonServers: ['continuum'] })
    expect(find(await doctor(repo.root), /approved in Claude Code/)?.status).toBe('ok')
    writeSettings(repo.root, { ...readSettings(repo.root), enabledMcpjsonServers: [], disabledMcpjsonServers: ['continuum'] })
    expect(find(await doctor(repo.root), /declined/)).toMatchObject({ status: 'fail', fix: expect.stringContaining('/mcp') })
  })

  it('flags hooks that point at a Continuum that moved or was deleted', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])
    const settings = JSON.stringify(readSettings(repo.root)).replaceAll('/packages/cli/src/bin.ts', '/moved-away/packages/cli/src/bin.ts')
    writeFileSync(join(repo.root, SETTINGS), settings)
    expect(find(await doctor(repo.root), /no longer exist/)).toMatchObject({ status: 'fail', detail: expect.stringContaining('moved-away') })
  })

  it('warns when hooks run a different install than this one', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])
    const other = { command: 'npx', args: ['-y', '@acme/continuum@9.9.9'], portable: true }
    expect(find(await doctor(repo.root, { invocation: other }), /different Continuum install/)?.status).toBe('warn')
  })

  it('reports a damaged store without suggesting deletion for other errors', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    writeFileSync(join(repo.root, '.continuum/context.db'), 'not a database at all, just text that is long enough to have a header')
    expect(find(await doctor(repo.root), /Store is damaged/)).toMatchObject({ status: 'fail', fix: expect.stringContaining('--purge') })
  })

  it('never upgrades or writes the store it inspects', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const path = join(repo.root, '.continuum/context.db')
    const before = readFileSync(path)
    await doctor(repo.root)
    expect(readFileSync(path).equals(before)).toBe(true)
  })

  it('reports missing hooks and exits non-zero when anything fails', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const result = await cli(repo.root, ['doctor'])
    expect(result.code).toBe(EXIT_FAILURE)
    expect(result.out).toContain('✗ Claude Code hooks are not registered (missing: SessionStart, SessionEnd, Stop, PostToolUse, PostToolUseFailure, UserPromptSubmit)')
    expect(result.out).toMatch(/problems? to fix/)
    await cli(repo.root, ['setup', 'claude-code'])
    expect((await cli(repo.root, ['doctor'])).code).toBe(EXIT_OK)
  })
})

describe('continuum doctor with Codex', () => {
  it('passes a repository connected only to Codex', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'codex'])
    const findings = await doctor(repo.root)
    expect(findings.filter((finding) => finding.status === 'fail')).toEqual([])
    expect(find(findings, /Codex hooks registered/)?.status).toBe('ok')
    expect(find(findings, /Claude Code not connected/)?.status).toBe('ok')
  })
})

describe('continuum doctor with Cursor', () => {
  it('passes a repository connected only to Cursor', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'cursor'])
    const findings = await doctor(repo.root)
    expect(findings.filter((finding) => finding.status === 'fail')).toEqual([])
    expect(find(findings, /Cursor MCP server registered/)?.status).toBe('ok')
  })
})
