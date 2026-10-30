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
  runDoctor({ cwd, nodeVersion: '24.1.0', platform: 'linux', invocation: selfInvocation(), webDist: '/nowhere', configDir: TEST_CONFIG_DIR, ...overrides })

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

  it('fails on a config it cannot read, since nothing is recorded until it is fixed', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])
    writeFileSync(join(repo.root, '.continuum/config.json'), '{ "redactPatterns": ["CUST-[0-9]+"], }')
    expect(find(await doctor(repo.root), /Settings cannot be read/)).toMatchObject({ status: 'fail', detail: expect.stringContaining('not valid JSON') })
  })

  it('fails on a .continuumignore it cannot read', async () => {
    const { mkdirSync } = await import('node:fs')
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])
    mkdirSync(join(repo.root, '.continuumignore'))
    expect(find(await doctor(repo.root), /continuumignore/)).toMatchObject({ status: 'fail' })
  })

  it('warns about redaction patterns it cannot use, and names them', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])
    writeFileSync(join(repo.root, '.continuum/config.json'), JSON.stringify({ redactPatterns: ['CUST-[0-9]+', '(unclosed'] }))
    expect(find(await doctor(repo.root), /redaction pattern/)).toMatchObject({ status: 'warn', label: '1 redaction pattern is not used', detail: '(unclosed' })
    writeFileSync(join(repo.root, '.continuum/config.json'), JSON.stringify({ redactPatterns: ['CUST-[0-9]+'] }))
    expect(find(await doctor(repo.root), /Settings/)).toMatchObject({ status: 'ok', detail: expect.stringContaining('1 redaction pattern') })
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

describe('continuum doctor on hooks that never arrive or fail', () => {
  it('warns when a connected agent has sent no hook yet, and passes once one arrives', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])
    expect(find(await doctor(repo.root), /hook has reached Continuum/)).toMatchObject({ status: 'warn', label: 'No Claude Code hook has reached Continuum yet' })
    const { recordHookArrival } = await import('@continuum/capture')
    await recordHookArrival(repo.root, 'claude-code', new Date())
    expect(find(await doctor(repo.root), /hooks reach Continuum/)).toMatchObject({ status: 'ok', label: 'Claude Code hooks reach Continuum', detail: expect.stringContaining('just now') })
  })

  it('fails with the reason when the last hook failed, even for an agent set up by a plugin', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const { recordHookArrival, recordHookFailure } = await import('@continuum/capture')
    await recordHookArrival(repo.root, 'claude-code', new Date())
    await recordHookFailure(repo.root, 'claude-code', new Date(), 'git could not run, so nothing was recorded: Xcode license')
    expect(find(await doctor(repo.root), /last Claude Code hook failed/)).toMatchObject({ status: 'fail', detail: expect.stringContaining('Xcode license') })
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

describe('continuum doctor with VS Code', () => {
  it('passes a repository connected only to VS Code, and warns when its server is missing', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'vscode'])
    const findings = await doctor(repo.root)
    expect(findings.filter((finding) => finding.status === 'fail')).toEqual([])
    expect(find(findings, /VS Code \(Copilot\) hooks registered/)?.status).toBe('ok')
    expect(find(findings, /VS Code MCP server registered/)?.status).toBe('ok')
    expect(find(findings, /Claude Code not connected/)?.status).toBe('ok')

    repo.write('.vscode/mcp.json', JSON.stringify({ servers: {} }))
    expect(find(await doctor(repo.root), /MCP server is not in \.vscode\/mcp\.json/)?.status).toBe('warn')
  })
})
