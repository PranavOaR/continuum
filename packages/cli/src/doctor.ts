import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { findRepoRoot, isInitialized, isTracked, locateWorkspace, NotAGitRepositoryError, readRegistry } from '@continuum/capture'
import { CODEX_HOOKS_FILE, HOOK_EVENTS, HOOKS_FILE, isContinuumHandler, isContinuumServer, MCP_FILE, MCP_SERVER_NAME, type Invocation } from '@continuum/claude-code'
import { inspectStore, isCorruptStoreError, LATEST_SCHEMA_VERSION } from '@continuum/store'

/** node:sqlite works without a flag from this version on. */
export const MIN_NODE_VERSION: readonly [number, number] = [22, 13]
const SETUP_FIX = 'Run `continuum setup claude-code` in this repository.'

export type FindingStatus = 'ok' | 'warn' | 'fail'

export interface Finding {
  status: FindingStatus
  label: string
  detail?: string
  fix?: string
}

export interface DoctorEnvironment {
  cwd: string
  nodeVersion: string
  /** How this CLI would configure Claude Code now, to spot hooks left pointing at another install. */
  invocation: Invocation
  webDist: string
  /** Holds the registry of connected repositories that `continuum serve` shows. */
  configDir: string
}

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

async function readJson(path: string): Promise<Json | null | 'invalid'> {
  if (!existsSync(path)) return null
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    return isObject(parsed) ? parsed : 'invalid'
  } catch {
    return 'invalid'
  }
}

export function checkNode(version: string): Finding {
  const [major = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number)
  const [needMajor, needMinor] = MIN_NODE_VERSION
  const supported = major > needMajor || (major === needMajor && minor >= needMinor)
  return supported
    ? { status: 'ok', label: `Node.js ${version}` }
    : { status: 'fail', label: `Node.js ${version} is too old`, fix: `Install Node.js ${needMajor}.${needMinor} or newer; Continuum's store needs node:sqlite.` }
}

async function checkGit(): Promise<Finding> {
  try {
    const { stdout } = await promisify(execFile)('git', ['--version'])
    return { status: 'ok', label: stdout.trim() }
  } catch {
    return { status: 'fail', label: 'git was not found', fix: 'Install git and make sure it is on your PATH.' }
  }
}

/** Read-only: diagnosing a store never migrates or writes it. */
function checkStore(storePath: string): Finding {
  try {
    const { schemaVersion, events, lastActivity } = inspectStore(storePath)
    const detail = `${events} event${events === 1 ? '' : 's'}, schema v${schemaVersion}${lastActivity ? `, last activity ${lastActivity}` : ''}`
    if (schemaVersion > LATEST_SCHEMA_VERSION) {
      return { status: 'fail', label: 'Store is from a newer Continuum', detail: `schema v${schemaVersion}; this version reads up to v${LATEST_SCHEMA_VERSION}`, fix: 'Upgrade Continuum.' }
    }
    if (schemaVersion < LATEST_SCHEMA_VERSION) return { status: 'ok', label: 'Store opens', detail: `${detail}; upgraded to v${LATEST_SCHEMA_VERSION} on next use` }
    return { status: 'ok', label: 'Store opens', detail }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isCorruptStoreError(error)) {
      return { status: 'fail', label: 'Store is damaged', detail: message, fix: 'Run `continuum uninstall --purge`, then set up again. This deletes the recorded history.' }
    }
    return { status: 'fail', label: 'Store cannot be read', detail: message, fix: `Check that you can read ${storePath}, then try again.` }
  }
}

/** Absolute paths a hook or server command depends on, including file: URLs such as the tsx loader. */
function referencedPaths(entry: { command?: unknown; args?: unknown }): string[] {
  const parts = [entry.command, ...(Array.isArray(entry.args) ? entry.args : [])].filter((part): part is string => typeof part === 'string')
  return parts.flatMap((part) => (part.startsWith('file:') ? [fileURLToPath(part)] : isAbsolute(part) ? [part] : []))
}

const sameCommand = (entry: { command?: unknown; args?: unknown }, invocation: Invocation, subcommand: string) =>
  JSON.stringify([entry.command, entry.args]) === JSON.stringify([invocation.command, [...invocation.args, subcommand]])

function checkHooks(settings: Json | null | 'invalid', invocation: Invocation): Finding {
  if (settings === 'invalid') return { status: 'fail', label: `${HOOKS_FILE} is not a valid JSON object`, fix: `Fix or remove it, then: ${SETUP_FIX}` }
  const hooks = isObject(settings?.hooks) ? settings.hooks : {}
  const handlers = (event: string) =>
    (Array.isArray(hooks[event]) ? hooks[event] : []).flatMap((group: unknown) => (isObject(group) && Array.isArray(group.hooks) ? group.hooks : [])).filter(isObject).filter(isContinuumHandler)
  const missing = HOOK_EVENTS.filter((event) => handlers(event).length === 0)
  if (missing.length > 0) return { status: 'fail', label: 'Claude Code hooks are not registered', detail: `missing: ${missing.join(', ')}`, fix: SETUP_FIX }
  const all = HOOK_EVENTS.flatMap(handlers)
  const broken = [...new Set(all.flatMap(referencedPaths).filter((path) => !existsSync(path)))]
  if (broken.length > 0) return { status: 'fail', label: 'Claude Code hooks point at files that no longer exist', detail: broken.join(', '), fix: SETUP_FIX }
  if (!all.every((handler) => sameCommand(handler, invocation, 'ingest'))) {
    return { status: 'warn', label: 'Claude Code hooks run a different Continuum install', detail: 'they work, but not with this version', fix: `${SETUP_FIX} It updates them in place.` }
  }
  return { status: 'ok', label: 'Claude Code hooks registered', detail: HOOK_EVENTS.join(', ') }
}

async function checkMcp(root: string, config: Json | null | 'invalid', settings: Json | null | 'invalid'): Promise<Finding[]> {
  if (config === 'invalid') return [{ status: 'fail', label: `${MCP_FILE} is not a valid JSON object`, fix: `Fix or remove it, then: ${SETUP_FIX}` }]
  const server = isObject(config?.mcpServers) ? config.mcpServers[MCP_SERVER_NAME] : undefined
  if (!isContinuumServer(server)) {
    const tracked = await isTracked(root, MCP_FILE)
    return [
      tracked
        ? { status: 'warn', label: `MCP server is not in the shared ${MCP_FILE}`, detail: 'it may be registered with `claude mcp add` instead, which Continuum cannot see', fix: 'In Claude Code, run /mcp and check that "continuum" is listed.' }
        : { status: 'fail', label: 'MCP server is not registered', fix: SETUP_FIX },
    ]
  }
  const broken = referencedPaths(server as Json).filter((path) => !existsSync(path))
  if (broken.length > 0) return [{ status: 'fail', label: 'MCP server points at files that no longer exist', detail: broken.join(', '), fix: SETUP_FIX }]
  return [{ status: 'ok', label: `MCP server registered in ${MCP_FILE}` }, approval(isObject(settings) ? settings : {})]
}

/** Claude Code asks before starting a project's MCP servers and records the answer in the local settings. */
function approval(settings: Json): Finding {
  const listed = (key: string) => Array.isArray(settings[key]) && (settings[key] as unknown[]).includes(MCP_SERVER_NAME)
  if (listed('disabledMcpjsonServers')) {
    return { status: 'fail', label: 'The continuum MCP server was declined in Claude Code', fix: `In Claude Code, run /mcp and enable "continuum", or remove it from disabledMcpjsonServers in ${HOOKS_FILE}.` }
  }
  if (settings.enableAllProjectMcpServers === true || listed('enabledMcpjsonServers')) return { status: 'ok', label: 'MCP server approved in Claude Code' }
  return { status: 'warn', label: 'MCP server not approved yet', detail: 'Claude Code asks the first time it starts in this repository', fix: 'Start Claude Code here and approve "continuum" (or run /mcp).' }
}

/** Codex is connected when its project hooks run Continuum; null when it is not set up here. */
async function checkCodex(root: string): Promise<Finding | null> {
  const hooks = await readJson(join(root, CODEX_HOOKS_FILE))
  if (hooks === null) return null
  if (hooks === 'invalid') return { status: 'fail', label: `${CODEX_HOOKS_FILE} is not a valid JSON object`, fix: 'Fix or remove it, then run `continuum setup codex`.' }
  const connected = JSON.stringify(hooks).includes('ingest --agent codex')
  if (!connected) return null
  return {
    status: 'ok',
    label: 'Codex hooks registered',
    detail: 'Codex runs them once the project is trusted and you have reviewed them with /hooks',
  }
}

function checkDashboard(webDist: string): Finding {
  return existsSync(join(webDist, 'index.html'))
    ? { status: 'ok', label: 'Dashboard available', detail: 'continuum serve' }
    : { status: 'warn', label: 'Dashboard is not built', detail: `${webDist} is missing; \`continuum serve\` offers only the API`, fix: 'In a Continuum checkout, run `npm run build`.' }
}

/** Every check, in the order a user would fix them. Stops at the first missing prerequisite. */
export async function runDoctor(env: DoctorEnvironment): Promise<Finding[]> {
  const findings: Finding[] = [checkNode(env.nodeVersion), await checkGit()]
  if (findings.some((finding) => finding.status === 'fail')) return findings
  try {
    await findRepoRoot(env.cwd)
  } catch (error) {
    if (!(error instanceof NotAGitRepositoryError)) throw error
    return [...findings, { status: 'fail', label: 'Not inside a git repository', detail: env.cwd, fix: 'Run doctor from your project, or `git init` it first.' }]
  }
  const workspace = await locateWorkspace(env.cwd)
  findings.push({ status: 'ok', label: 'Git repository', detail: workspace.root })
  if (!isInitialized(workspace)) return [...findings, { status: 'fail', label: 'Continuum is not set up here', fix: SETUP_FIX }]
  findings.push(checkStore(workspace.storePath))
  const [settings, mcpConfig] = await Promise.all([readJson(join(workspace.root, HOOKS_FILE)), readJson(join(workspace.root, MCP_FILE))])
  const codex = await checkCodex(workspace.root)
  const claudeHooks = checkHooks(settings, env.invocation)
  const claudeMissing = settings === null && claudeHooks.status === 'fail'
  if (claudeMissing && codex) {
    // Connected through Codex only: Claude Code's absence is not a problem.
    findings.push({ status: 'ok', label: 'Claude Code not connected', detail: 'Codex is; run `continuum setup claude-code` to add it' }, codex)
  } else {
    findings.push(claudeHooks, ...(await checkMcp(workspace.root, mcpConfig, settings)), ...(codex ? [codex] : []))
  }
  findings.push(checkDashboard(env.webDist))
  const listed = (await readRegistry(env.configDir)).some((entry) => entry.root === workspace.root)
  findings.push(
    listed
      ? { status: 'ok', label: 'Shown by `continuum serve` from anywhere' }
      : { status: 'warn', label: 'Not in your dashboard list', detail: 'set up before Continuum kept one', fix: SETUP_FIX },
  )
  return findings
}
