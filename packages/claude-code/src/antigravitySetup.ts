import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { addGitExclude, isTracked, removeGitExclude } from '@continuum/capture'
import { ANTIGRAVITY_EDIT_TOOLS, type AntigravityEvent } from './antigravity'
import { GIT_EXCLUDE_COMMENT, MCP_SERVER_NAME, SetupError, type FileAction, type Invocation, type SetupResult } from './setup'

/** Antigravity CLI reads a project's hooks and MCP servers from here. */
export const ANTIGRAVITY_HOOKS_FILE = '.agents/hooks.json'
export const ANTIGRAVITY_MCP_FILE = '.agents/mcp_config.json'

/** Antigravity groups hooks under a name; Continuum's are all under this one. */
const HOOK_NAME = 'continuum'
const INGEST = 'ingest --agent antigravity'
/** Seconds; the briefing is built in under a second, and Antigravity's default is 30. */
const SESSION_START_TIMEOUT_S = 20
const SYNC_TIMEOUT_S = 10

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A hook command is one shell string: quote whatever the shell would split or expand. */
function shellQuote(part: string): string {
  return /^[\w@%+=:,./-]+$/.test(part) ? part : `'${part.replaceAll("'", `'\\''`)}'`
}

const commandLine = (invocation: Invocation, ...rest: string[]) => [invocation.command, ...invocation.args, ...rest].map(shellQuote).join(' ')

/** Continuum's hooks: each command names its event, because Antigravity's payloads do not. */
function ourHooks(invocation: Invocation): Json {
  const handler = (event: AntigravityEvent, timeout: number) => ({ type: 'command', command: commandLine(invocation, ...INGEST.split(' '), '--event', event), timeout })
  return {
    SessionStart: [handler('SessionStart', SESSION_START_TIMEOUT_S)],
    // One entry per tool, so the matcher works whether Antigravity reads it as a name or a pattern.
    PostToolUse: Object.keys(ANTIGRAVITY_EDIT_TOOLS).map((tool) => ({ matcher: tool, hooks: [handler('PostToolUse', SYNC_TIMEOUT_S)] })),
    Stop: [handler('Stop', SYNC_TIMEOUT_S)],
  }
}

/** Ours: every command under the hook name runs Continuum's Antigravity ingest. */
function isOurs(group: unknown): boolean {
  if (!isObject(group)) return false
  const commands = JSON.stringify(group).match(/"command":"(?:[^"\\]|\\.)*"/g) ?? []
  return commands.length > 0 && commands.every((command) => command.includes(INGEST))
}

async function readText(path: string): Promise<string | null> {
  return existsSync(path) ? readFile(path, 'utf8') : null
}

async function writeAtomically(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.continuum-${process.pid}.tmp`
  await writeFile(temporary, text)
  await rename(temporary, path)
}

function parseObject(file: string, text: string | null): Json {
  if (text === null) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new SetupError(`${file} is not valid JSON; fix or remove it, then run setup again. Nothing was changed.`)
  }
  if (!isObject(parsed)) throw new SetupError(`${file} must contain a JSON object. Nothing was changed.`)
  return parsed
}

/** The hooks file with Continuum's group replaced, or removed when `add` is null. */
function withHooks(hooks: Json, add: Json | null): Json {
  if (HOOK_NAME in hooks && !isOurs(hooks[HOOK_NAME])) {
    throw new SetupError(`${ANTIGRAVITY_HOOKS_FILE} already has hooks named "${HOOK_NAME}" that Continuum did not write; rename or remove them, then run setup again. Nothing was changed.`)
  }
  const { [HOOK_NAME]: _previous, ...rest } = hooks
  return add ? { ...rest, [HOOK_NAME]: add } : rest
}

/** Ours: a stdio server running Continuum's `mcp`. */
const isOurServer = (server: unknown) => isObject(server) && Array.isArray(server.args) && server.args.at(-1) === 'mcp' && /continuum/.test(JSON.stringify(server))

/** The MCP file with Continuum's server replaced, or removed when `server` is null. */
function withServer(config: Json, server: Json | null): Json {
  if (config.mcpServers !== undefined && !isObject(config.mcpServers)) throw new SetupError(`"mcpServers" in ${ANTIGRAVITY_MCP_FILE} must be an object. Nothing was changed.`)
  const servers = (config.mcpServers ?? {}) as Json
  if (MCP_SERVER_NAME in servers && !isOurServer(servers[MCP_SERVER_NAME])) {
    throw new SetupError(`${ANTIGRAVITY_MCP_FILE} already has a "${MCP_SERVER_NAME}" server that Continuum did not write; rename or remove it, then run setup again. Nothing was changed.`)
  }
  const { [MCP_SERVER_NAME]: _previous, ...others } = servers
  const next = server ? { ...others, [MCP_SERVER_NAME]: server } : others
  const { mcpServers: _servers, ...rest } = config
  return Object.keys(next).length > 0 ? { ...rest, mcpServers: next } : rest
}

const asText = (value: Json) => `${JSON.stringify(value, null, 2)}\n`

async function apply(root: string, file: string, before: string | null, after: string, keepOutOfGit: boolean): Promise<FileAction> {
  if (!keepOutOfGit) await removeGitExclude(root, `/${file}`, GIT_EXCLUDE_COMMENT)
  if (before === after) return 'unchanged'
  await writeAtomically(join(root, file), after)
  if (before === null && keepOutOfGit) await addGitExclude(root, `/${file}`, GIT_EXCLUDE_COMMENT)
  return before === null ? 'created' : 'updated'
}

/**
 * Wires Antigravity CLI to Continuum for one repository: hooks in
 * .agents/hooks.json and the MCP server in .agents/mcp_config.json. The server
 * names this repository as its working directory, since Antigravity does not
 * say which it uses, so that file is always kept out of git.
 */
export async function setupAntigravity(root: string, invocation: Invocation): Promise<SetupResult> {
  const [hooksText, mcpText, mcpTracked] = await Promise.all([readText(join(root, ANTIGRAVITY_HOOKS_FILE)), readText(join(root, ANTIGRAVITY_MCP_FILE)), isTracked(root, ANTIGRAVITY_MCP_FILE)])
  // Compute both results before writing either, so a refusal changes nothing.
  const nextHooks = asText(withHooks(parseObject(ANTIGRAVITY_HOOKS_FILE, hooksText), ourHooks(invocation)))
  const server = { command: invocation.command, args: [...invocation.args, 'mcp'], cwd: root }
  const nextMcp = mcpTracked ? null : asText(withServer(parseObject(ANTIGRAVITY_MCP_FILE, mcpText), server))
  const files: SetupResult['files'] = [{ path: ANTIGRAVITY_HOOKS_FILE, action: await apply(root, ANTIGRAVITY_HOOKS_FILE, hooksText, nextHooks, !invocation.portable) }]
  if (nextMcp === null) {
    files.push({ path: ANTIGRAVITY_MCP_FILE, action: 'skipped', note: `tracked by git and shared with your team, so it was not changed. Add a "${MCP_SERVER_NAME}" server running ${commandLine(invocation, 'mcp')} to ~/.gemini/config/mcp_config.json for yourself.` })
  } else files.push({ path: ANTIGRAVITY_MCP_FILE, action: await apply(root, ANTIGRAVITY_MCP_FILE, mcpText, nextMcp, true) })
  return { files }
}

/** Removes only what setupAntigravity added; files left empty and untracked are deleted. */
export async function removeAntigravitySetup(root: string): Promise<SetupResult> {
  const files: SetupResult['files'] = []
  const remove = async (file: string, change: (value: Json) => Json) => {
    const path = join(root, file)
    const before = await readText(path)
    if (before === null) return
    const after = change(parseObject(file, before))
    if (asText(after) === asText(parseObject(file, before))) return void files.push({ path: file, action: 'unchanged' })
    if (Object.keys(after).length === 0 && !(await isTracked(root, file))) {
      await rm(path)
      await removeGitExclude(root, `/${file}`, GIT_EXCLUDE_COMMENT)
    } else await writeAtomically(path, asText(after))
    files.push({ path: file, action: 'removed' })
  }
  await remove(ANTIGRAVITY_HOOKS_FILE, (hooks) => withHooks(hooks, null))
  await remove(ANTIGRAVITY_MCP_FILE, (config) => withServer(config, null))
  return { files }
}
