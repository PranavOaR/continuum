import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { addGitExclude, isTracked, removeGitExclude } from '@continuum/capture'
import { FILE_EDIT_TOOLS, SHELL_TOOL, TASK_TOOLS } from './hookPayload'

/** Hooks hold machine-specific paths, so they go in the gitignored local settings, never in ~/.claude. */
export const HOOKS_FILE = '.claude/settings.local.json'
export const MCP_FILE = '.mcp.json'
export const MCP_SERVER_NAME = 'continuum'
/** Marks the .git/info/exclude entries setup adds, so uninstall can remove exactly those. */
export const GIT_EXCLUDE_COMMENT = 'Continuum: machine-specific Claude Code configuration'
const INGEST = 'ingest'
const MCP = 'mcp'
const SESSION_START_TIMEOUT_S = 20
const SESSION_END_TIMEOUT_S = 10
const BACKGROUND_TIMEOUT_S = 30
/**
 * A path or package that is the Continuum CLI: this checkout's bin.ts, a
 * `continuum` binary, the release bundle, or an npm package named continuum.
 */
const CONTINUUM_PROGRAM = /(^|[\\/])packages[\\/]cli[\\/]src[\\/]bin\.ts$|(^|[\\/@])continuum(@[\w.-]+)?$|(^|[\\/])continuum\.js$/

/** How to run this CLI, e.g. `node --import tsx …/bin.ts` during development or `npx …` once published. */
export interface Invocation {
  command: string
  args: string[]
  /** True when it works on any machine (npx), so .mcp.json can be committed and shared. */
  portable: boolean
}

export type FileAction = 'created' | 'updated' | 'unchanged' | 'removed' | 'skipped'

export interface SetupResult {
  files: { path: string; action: FileAction; note?: string }[]
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

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

function runsContinuum(entry: { command?: unknown; args?: unknown }, subcommand: string): boolean {
  const args = Array.isArray(entry.args) ? entry.args : []
  if (args.at(-1) !== subcommand) return false
  return [entry.command, ...args.slice(0, -1)].some((part) => typeof part === 'string' && CONTINUUM_PROGRAM.test(part))
}

/** Ours: an MCP server entry that runs the Continuum CLI's `mcp`. */
export function isContinuumServer(server: unknown): boolean {
  return isObject(server) && runsContinuum(server, MCP)
}

/** Ours: a command hook that runs the Continuum CLI's `ingest`. */
export function isContinuumHandler(handler: HookHandler): boolean {
  return handler.type === 'command' && runsContinuum(handler, INGEST)
}

async function readJsonObject(path: string): Promise<Json | null> {
  if (!existsSync(path)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new SetupError(`${path} is not valid JSON; fix or remove it, then run setup again. Nothing was changed.`)
  }
  if (!isObject(parsed)) throw new SetupError(`${path} must contain a JSON object. Nothing was changed.`)
  return parsed
}

/** Write-then-rename, so a crash never leaves a half-written settings file. */
async function writeAtomically(path: string, value: Json): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.continuum-${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporary, path)
}

/** Removes our handlers from an event's groups. Anything not in the documented shape is passed through untouched. */
function withoutOurs(groups: unknown): unknown {
  if (!Array.isArray(groups)) return groups
  return groups.flatMap((group: unknown) => {
    if (!isObject(group) || !Array.isArray(group.hooks)) return [group]
    const kept = (group.hooks as HookHandler[]).filter((handler) => !isContinuumHandler(handler))
    if (kept.length === group.hooks.length) return [group]
    return kept.length > 0 ? [{ ...group, hooks: kept }] : []
  })
}

/** The Claude Code events setup registers. */
export const HOOK_EVENTS = ['SessionStart', 'SessionEnd', 'Stop', 'PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit'] as const

function ourHooks(invocation: Invocation): Record<(typeof HOOK_EVENTS)[number], Json[]> {
  const handler = (extra: Json): Json => ({ type: 'command', command: invocation.command, args: [...invocation.args, INGEST], ...extra })
  return {
    // Synchronous: its output is injected as context before Claude's first turn.
    SessionStart: [{ hooks: [handler({ timeout: SESSION_START_TIMEOUT_S })] }],
    SessionEnd: [{ hooks: [handler({ timeout: SESSION_END_TIMEOUT_S })] }],
    // Synchronous too: Claude Code can exit right after the last turn (always with -p),
    // which kills background hooks before the final message is recorded.
    Stop: [{ hooks: [handler({ timeout: SESSION_END_TIMEOUT_S })] }],
    // In the background, so capture never slows editing down; the session keeps running meanwhile.
    // File edits; Bash, so successful test, lint and build runs are recorded; and the task tools, to link the session to its task.
    PostToolUse: [{ matcher: [...Object.keys(FILE_EDIT_TOOLS), SHELL_TOOL, ...TASK_TOOLS].join('|'), hooks: [handler({ async: true, timeout: BACKGROUND_TIMEOUT_S })] }],
    // A Bash command that exits non-zero arrives here instead, with "Exit code N".
    PostToolUseFailure: [{ matcher: SHELL_TOOL, hooks: [handler({ async: true, timeout: BACKGROUND_TIMEOUT_S })] }],
    // Recorded only after `continuum config prompts on`; in the background so typing is never slowed.
    UserPromptSubmit: [{ hooks: [handler({ async: true, timeout: BACKGROUND_TIMEOUT_S })] }],
  }
}

function mergeHooks(settings: Json, add: Record<string, Json[]>): Json {
  if (settings.hooks !== undefined && !isObject(settings.hooks)) throw new SetupError(`"hooks" in ${HOOKS_FILE} must be an object. Nothing was changed.`)
  const existing = settings.hooks ?? {}
  const merged: Json = {}
  for (const [event, groups] of Object.entries(existing)) {
    const kept = withoutOurs(groups)
    // Drop an event only when removing our handlers emptied it; leave the user's own empty entries alone.
    const emptiedByUs = Array.isArray(kept) && kept.length === 0 && Array.isArray(groups) && groups.length > 0
    if (!emptiedByUs || add[event]) merged[event] = kept
  }
  for (const [event, groups] of Object.entries(add)) merged[event] = [...((merged[event] as unknown[] | undefined) ?? []), ...groups]
  const { hooks: _previous, ...rest } = settings
  return Object.keys(merged).length > 0 ? { ...rest, hooks: merged } : rest
}

function mergeMcp(config: Json, server: Json | null): Json {
  if (config.mcpServers !== undefined && !isObject(config.mcpServers)) throw new SetupError(`"mcpServers" in ${MCP_FILE} must be an object. Nothing was changed.`)
  const servers = config.mcpServers ?? {}
  const current = servers[MCP_SERVER_NAME]
  if (current !== undefined && !isContinuumServer(current)) {
    throw new SetupError(`${MCP_FILE} already has a "${MCP_SERVER_NAME}" server that Continuum did not write; rename or remove it, then run setup again. Nothing was changed.`)
  }
  const { [MCP_SERVER_NAME]: _previous, ...others } = servers
  return { ...config, mcpServers: server ? { ...others, [MCP_SERVER_NAME]: server } : others }
}

const isEmptyConfig = (value: Json) => Object.keys(value).every((key) => isObject(value[key]) && Object.keys(value[key] as Json).length === 0)

/**
 * Wires Claude Code to Continuum for one repository: capture hooks in
 * .claude/settings.local.json and the MCP server in .mcp.json. Existing hooks
 * and servers are kept; re-running replaces only Continuum's own entries.
 * A .mcp.json that git tracks is shared with the team, so it is left alone.
 */
export async function setupClaudeCode(root: string, invocation: Invocation): Promise<SetupResult> {
  const hooksPath = join(root, HOOKS_FILE)
  const mcpPath = join(root, MCP_FILE)
  const [settings, mcpConfig, mcpTracked] = await Promise.all([readJsonObject(hooksPath), readJsonObject(mcpPath), isTracked(root, MCP_FILE)])
  // Compute both results before writing either, so a refusal changes nothing.
  const nextSettings = mergeHooks(settings ?? {}, ourHooks(invocation))
  const server = { command: invocation.command, args: [...invocation.args, MCP] }
  const nextMcp = mcpTracked ? null : mergeMcp(mcpConfig ?? {}, server)

  const files: SetupResult['files'] = []
  files.push({ path: HOOKS_FILE, action: await apply(root, HOOKS_FILE, settings, nextSettings, true) })
  if (nextMcp) {
    // A portable server entry works for everyone, so .mcp.json may be committed; a machine-specific one is kept out of git.
    files.push({ path: MCP_FILE, action: await apply(root, MCP_FILE, mcpConfig, nextMcp, !invocation.portable) })
  } else {
    files.push({
      path: MCP_FILE,
      action: 'skipped',
      note: `tracked by git and shared with your team, so it was not changed. To add the server for yourself only: claude mcp add ${MCP_SERVER_NAME} -- ${[server.command, ...server.args].join(' ')}`,
    })
  }
  return { files }
}

async function apply(root: string, file: string, before: Json | null, after: Json, keepOutOfGit: boolean): Promise<FileAction> {
  // A config that became portable may be committed, so lift an exclude an earlier machine-specific setup added.
  if (!keepOutOfGit) await removeGitExclude(root, `/${file}`, GIT_EXCLUDE_COMMENT)
  if (before && JSON.stringify(before) === JSON.stringify(after)) return 'unchanged'
  await writeAtomically(join(root, file), after)
  if (before === null && keepOutOfGit) await addGitExclude(root, `/${file}`, GIT_EXCLUDE_COMMENT)
  return before === null ? 'created' : 'updated'
}

/** Removes only what setupClaudeCode added, leaving every other hook and server in place. */
export async function removeClaudeCodeSetup(root: string): Promise<SetupResult> {
  const files: SetupResult['files'] = []
  const steps: [string, (value: Json) => Json][] = [
    [HOOKS_FILE, (settings) => mergeHooks(settings, {})],
    [MCP_FILE, (config) => mergeMcp(config, null)],
  ]
  for (const [file, change] of steps) {
    const path = join(root, file)
    const before = await readJsonObject(path)
    if (!before) continue
    const after = change(before)
    if (JSON.stringify(before) === JSON.stringify(after)) {
      files.push({ path: file, action: 'unchanged' })
      continue
    }
    // A file left with nothing but empty containers was ours alone; remove it unless the team tracks it.
    if (isEmptyConfig(after) && !(await isTracked(root, file))) {
      await rm(path)
      await removeGitExclude(root, `/${file}`, GIT_EXCLUDE_COMMENT)
    } else await writeAtomically(path, after)
    files.push({ path: file, action: 'removed' })
  }
  return { files }
}
