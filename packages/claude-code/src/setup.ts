import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { addGitExclude } from '@continuum/capture'
import { FILE_EDIT_TOOLS } from './hookPayload'

/** Hooks hold machine-specific paths, so they go in the gitignored local settings, never in ~/.claude. */
export const HOOKS_FILE = '.claude/settings.local.json'
export const MCP_FILE = '.mcp.json'
export const MCP_SERVER_NAME = 'continuum'
const INGEST = 'ingest'
const SESSION_START_TIMEOUT_S = 20
const SESSION_END_TIMEOUT_S = 10
const BACKGROUND_TIMEOUT_S = 30

/** How to run this CLI, e.g. `node --import tsx …/bin.ts` during development or `npx …` once published. */
export interface Invocation {
  command: string
  args: string[]
}

export type FileAction = 'created' | 'updated' | 'unchanged' | 'removed'

export interface SetupResult {
  files: { path: string; action: FileAction }[]
}

export class SetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SetupError'
  }
}

type Json = Record<string, unknown>
interface HookHandler {
  type?: unknown
  command?: unknown
  args?: unknown
  [key: string]: unknown
}
interface HookGroup {
  matcher?: string
  hooks?: HookHandler[]
  [key: string]: unknown
}

async function readJsonObject(path: string): Promise<Json | null> {
  if (!existsSync(path)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new SetupError(`${path} is not valid JSON; fix or remove it, then run setup again. Nothing was changed.`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new SetupError(`${path} must contain a JSON object. Nothing was changed.`)
  return parsed as Json
}

async function writeJson(path: string, value: Json, existed: boolean, before: Json | null): Promise<FileAction> {
  if (before && JSON.stringify(before) === JSON.stringify(value)) return 'unchanged'
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
  return existed ? 'updated' : 'created'
}

/** Ours: a command hook whose last argument is `ingest` and that runs a continuum binary. */
export function isContinuumHandler(handler: HookHandler): boolean {
  const args = Array.isArray(handler.args) ? handler.args : []
  return handler.type === 'command' && args.at(-1) === INGEST && JSON.stringify(handler).includes('continuum')
}

function withoutOurs(groups: unknown): HookGroup[] {
  if (!Array.isArray(groups)) return []
  return (groups as HookGroup[])
    .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((handler) => !isContinuumHandler(handler)) }))
    .filter((group) => group.hooks.length > 0)
}

function ourHooks(invocation: Invocation): Record<string, HookGroup[]> {
  const handler = (extra: Json): HookHandler => ({ type: 'command', command: invocation.command, args: [...invocation.args, INGEST], ...extra })
  return {
    // Synchronous: its output is injected as context before Claude's first turn.
    SessionStart: [{ hooks: [handler({ timeout: SESSION_START_TIMEOUT_S })] }],
    SessionEnd: [{ hooks: [handler({ timeout: SESSION_END_TIMEOUT_S })] }],
    // Synchronous too: Claude Code can exit right after the last turn (always with -p),
    // which kills background hooks before the final message is recorded.
    Stop: [{ hooks: [handler({ timeout: SESSION_END_TIMEOUT_S })] }],
    // In the background, so capture never slows editing down; the session keeps running meanwhile.
    PostToolUse: [{ matcher: Object.keys(FILE_EDIT_TOOLS).join('|'), hooks: [handler({ async: true, timeout: BACKGROUND_TIMEOUT_S })] }],
  }
}

function mergeHooks(settings: Json, add: Record<string, HookGroup[]>): Json {
  const existing = (typeof settings.hooks === 'object' && settings.hooks !== null ? settings.hooks : {}) as Record<string, unknown>
  const events = new Set([...Object.keys(existing), ...Object.keys(add)])
  const hooks = Object.fromEntries(
    [...events]
      .map((event) => [event, [...withoutOurs(existing[event]), ...(add[event] ?? [])]] as const)
      .filter(([, groups]) => groups.length > 0),
  )
  const { hooks: _previous, ...rest } = settings
  return Object.keys(hooks).length > 0 ? { ...rest, hooks } : rest
}

function mergeMcp(config: Json, server: Json | null): Json {
  const servers = (typeof config.mcpServers === 'object' && config.mcpServers !== null ? config.mcpServers : {}) as Json
  const { [MCP_SERVER_NAME]: _previous, ...others } = servers
  return { ...config, mcpServers: server ? { ...others, [MCP_SERVER_NAME]: server } : others }
}

async function update(root: string, file: string, change: (current: Json) => Json, options: { exclude: boolean }): Promise<{ path: string; action: FileAction }> {
  const path = join(root, file)
  const before = await readJsonObject(path)
  const action = await writeJson(path, change(before ?? {}), before !== null, before)
  if (action === 'created' && options.exclude) await addGitExclude(root, `/${file}`, 'Continuum: machine-specific Claude Code configuration')
  return { path: file, action }
}

/**
 * Wires Claude Code to Continuum for one repository: capture hooks in
 * .claude/settings.local.json and the MCP server in .mcp.json. Existing hooks
 * and servers are kept; re-running replaces only Continuum's own entries.
 */
export async function setupClaudeCode(root: string, invocation: Invocation): Promise<SetupResult> {
  const hooks = await update(root, HOOKS_FILE, (settings) => mergeHooks(settings, ourHooks(invocation)), { exclude: true })
  const mcp = await update(root, MCP_FILE, (config) => mergeMcp(config, { command: invocation.command, args: [...invocation.args, 'mcp'] }), { exclude: true })
  return { files: [hooks, mcp] }
}

/** Removes only what setupClaudeCode added, leaving every other hook and server in place. */
export async function removeClaudeCodeSetup(root: string): Promise<SetupResult> {
  const files: SetupResult['files'] = []
  for (const [file, change] of [
    [HOOKS_FILE, (settings: Json) => mergeHooks(settings, {})],
    [MCP_FILE, (config: Json) => mergeMcp(config, null)],
  ] as const) {
    if (!existsSync(join(root, file))) continue
    const result = await update(root, file, change, { exclude: false })
    files.push({ path: result.path, action: result.action === 'updated' ? 'removed' : result.action })
  }
  return { files }
}
