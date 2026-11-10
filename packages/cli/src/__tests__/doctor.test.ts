import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { doctorCommand } from '../commands/doctor'
import { setupCommand } from '../commands/setup'
import { checkNode, runDoctor, type Finding } from '../doctor'
import { selfInvocation } from '../invocation'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from '../io'
import { cli, TEST_CLAUDE_DIR, TEST_CONFIG_DIR } from './harness'

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

const io = (cwd: string) => ({ cwd, out: () => {}, err: () => {}, now: () => new Date(), configDir: TEST_CONFIG_DIR, claudeConfigDir: TEST_CLAUDE_DIR }) as unknown as Parameters<typeof setupCommand>[0]
const doctor = (cwd: string, overrides: Partial<Parameters<typeof runDoctor>[0]> = {}) =>
  runDoctor({ cwd, nodeVersion: '24.1.0', platform: 'linux', invocation: selfInvocation(), webDist: '/nowhere', configDir: TEST_CONFIG_DIR, claudeConfigDir: TEST_CLAUDE_DIR, ...overrides })

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

  it('passes a Windows setup, whose cmd /c switch is not a missing file', async () => {
    const repo = sandbox()
    const windows = { command: 'cmd', args: ['/c', 'npx', '-y', 'getcontinuum@0.4.0'], portable: false }
    expect(await setupCommand(io(repo.root), ['claude-code'], windows)).toBe(EXIT_OK)
    const findings = await doctor(repo.root, { platform: 'win32', invocation: windows })
    expect(findings.filter((finding) => finding.status === 'fail')).toEqual([])
    expect(find(findings, /hooks registered/)?.status).toBe('ok')
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
    // Either separator: on Windows the path is C:\\…\\packages\\cli\\src\\bin.ts, its backslashes escaped in JSON.
    const settings = JSON.stringify(readSettings(repo.root)).replace(/(\/|\\\\)packages(\/|\\\\)cli(\/|\\\\)src(\/|\\\\)bin\.ts/g, '$1moved-away$1packages$2cli$3src$4bin.ts')
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

  it('fails on redaction patterns it cannot use, naming them, since nothing is recorded until they are fixed', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])
    writeFileSync(join(repo.root, '.continuum/config.json'), JSON.stringify({ redactPatterns: ['CUST-[0-9]+', '(unclosed'] }))
    expect(find(await doctor(repo.root), /Settings cannot be read/)).toMatchObject({ status: 'fail', detail: expect.stringContaining('(unclosed') })
    writeFileSync(join(repo.root, '.continuum/config.json'), JSON.stringify({ redactPatterns: ['CUST-[0-9]+'] }))
    expect(find(await doctor(repo.root), /Settings/)).toMatchObject({ status: 'ok', detail: expect.stringContaining('1 redaction pattern') })
  })

  it('warns when the Claude Code plugin also runs here, since every hook would fire twice', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])
    expect(find(await doctor(repo.root), /plugin/)).toBeUndefined()
    const claudeConfigDir = mkdtempSync(join(tmpdir(), 'continuum-claude-'))
    dirs.push(claudeConfigDir)
    writeFileSync(join(claudeConfigDir, 'settings.json'), JSON.stringify({ enabledPlugins: { 'continuum@continuum': true } }))
    expect(find(await doctor(repo.root, { claudeConfigDir }), /plugin/)).toMatchObject({ status: 'warn', fix: expect.stringContaining('setup claude-code --remove') })
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

describe('continuum doctor --report', () => {
  it('prints a shareable report with the repository shortened to <repo>, and exits 0 even when checks fail', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const result = await cli(repo.root, ['doctor', '--report'])
    expect(result.code).toBe(EXIT_OK)
    expect(result.out).toContain('## Continuum diagnostic report')
    expect(result.out).toContain('✗ Claude Code hooks are not registered')
    expect(result.out).toMatch(/- Store: schema \d+ of \d+, \d+ events?/)
    expect(result.out).toContain('<repo>')
    expect(result.out).not.toContain(repo.root)
    expect(result.out).not.toContain(realpathSync(repo.root))
    // The report goes to stdout alone, so it can be piped straight into a file or the clipboard.
    expect(result.err).toBe('')
  })

  it('still reports outside a git repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'continuum-not-a-repo-'))
    dirs.push(dir)
    const result = await cli(dir, ['doctor', '--report'])
    expect(result.code).toBe(EXIT_OK)
    expect(result.out).toContain('No Continuum repository here')
  })

  it('refuses other arguments', async () => {
    expect((await cli(sandbox().root, ['doctor', '--bogus'])).code).toBe(EXIT_USAGE)
    expect((await cli(sandbox().root, ['doctor', '--open'])).code).toBe(EXIT_USAGE)
  })
})

describe('reporting a problem from doctor', () => {
  const recordingIo = (cwd: string) => {
    const out: string[] = []
    return { out, io: { ...io(cwd), out: (line: string) => out.push(line) } as Parameters<typeof doctorCommand>[0] }
  }

  it('ends a failing run with the one command that opens a pre-filled issue', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const result = await cli(repo.root, ['doctor'])
    expect(result.code).toBe(EXIT_FAILURE)
    expect(result.out).toContain('continuum doctor --report --open')
    expect(result.out).toContain('https://github.com/PranavOaR/continuum-plugin/issues')
  })

  it('says nothing about reporting when everything works', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])
    expect((await cli(repo.root, ['doctor'])).out).not.toContain('--report --open')
  })

  it('--report --open hands the browser a new issue with the scrubbed report in it', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const opened: string[] = []
    const { io: recording, out } = recordingIo(repo.root)
    const code = await doctorCommand(recording, ['--report', '--open'], selfInvocation(), '/nowhere', async (url) => void opened.push(url))

    expect(code).toBe(EXIT_OK)
    expect(opened).toHaveLength(1)
    const body = new URL(opened[0]).searchParams.get('body') ?? ''
    expect(body).toContain('## Continuum diagnostic report')
    expect(body).not.toContain(repo.root)
    expect(out.join('\n')).toMatch(/Nothing is submitted until you press/)
  })

  it('prints the link when no browser can be opened', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const { io: recording, out } = recordingIo(repo.root)
    const code = await doctorCommand(recording, ['--report', '--open'], selfInvocation(), '/nowhere', async () => {
      throw new Error('xdg-open was not found')
    })

    expect(code).toBe(EXIT_OK)
    expect(out.join('\n')).toContain('xdg-open was not found')
    expect(out.join('\n')).toContain('https://github.com/PranavOaR/continuum-plugin/issues/new?')
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
