import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { addGitExclude, isTracked, removeGitExclude } from '@continuum/capture'
import { PATCH_TOOL, TASK_TOOLS } from './hookPayload'
import { GIT_EXCLUDE_COMMENT, MCP_SERVER_NAME, SetupError, type FileAction, type Invocation, type SetupResult } from './setup'

/** Codex reads project hooks and config from here, once you trust the project. */
export const CODEX_HOOKS_FILE = '.codex/hooks.json'
export const CODEX_CONFIG_FILE = '.codex/config.toml'

const BLOCK_START = '# >>> continuum: managed by `continuum setup codex`; do not edit inside >>>'
const BLOCK_END = '# <<< continuum <<<'
const INGEST_SUFFIX = 'ingest --agent codex'
const SESSION_START_TIMEOUT_S = 20
const SYNC_TIMEOUT_S = 10
const BACKGROUND_TIMEOUT_S = 30

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Codex hook commands are one shell string: quote whatever the shell would split or expand. */
function shellQuote(part: string): string {
  return /^[\w@%+=:,./-]+$/.test(part) ? part : `'${part.replaceAll("'", `'\\''`)}'`
}

const commandLine = (invocation: Invocation, ...rest: string[]) => [invocation.command, ...invocation.args, ...rest].map(shellQuote).join(' ')

/** Ours: a command hook whose command runs Continuum's `ingest --agent codex`. */
function isOurHandler(handler: unknown): boolean {
  return isObject(handler) && handler.type === 'command' && typeof handler.command === 'string' && handler.command.endsWith(INGEST_SUFFIX) && /continuum/.test(handler.command)
}

function ourHooks(invocation: Invocation): Record<string, Json[]> {
  const handler = (extra: Json): Json => ({ type: 'command', command: commandLine(invocation, 'ingest', '--agent', 'codex'), ...extra })
  return {
    // Synchronous: its output is the briefing Codex starts with.
    SessionStart: [{ hooks: [handler({ timeout: SESSION_START_TIMEOUT_S, statusMessage: 'Loading where the work left off' })] }],
    // Patches (edits) and Continuum's own task tools; Codex reports no exit code for shell commands, so they are not recorded.
    PostToolUse: [{ matcher: [`^${PATCH_TOOL}$`, ...TASK_TOOLS.map((tool) => `^${tool}$`)].join('|'), hooks: [handler({ async: true, timeout: BACKGROUND_TIMEOUT_S })] }],
    UserPromptSubmit: [{ hooks: [handler({ async: true, timeout: BACKGROUND_TIMEOUT_S })] }],
    Stop: [{ hooks: [handler({ timeout: SYNC_TIMEOUT_S })] }],
    SessionEnd: [{ hooks: [handler({ timeout: 3 })] }],
  }
}

/** Existing hooks without ours, plus `add`; events left empty only by removing ours are dropped. */
function mergeHooks(settings: Json, add: Record<string, Json[]>): Json {
  if (settings.hooks !== undefined && !isObject(settings.hooks)) throw new SetupError(`"hooks" in ${CODEX_HOOKS_FILE} must be an object. Nothing was changed.`)
  const merged: Json = {}
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    if (!Array.isArray(groups)) {
      merged[event] = groups
      continue
    }
    const kept = groups.flatMap((group: unknown) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) return [group]
      const handlers = (group.hooks as unknown[]).filter((handler) => !isOurHandler(handler))
      if (handlers.length === group.hooks.length) return [group]
      return handlers.length > 0 ? [{ ...group, hooks: handlers }] : []
    })
    if (kept.length > 0 || groups.length === 0) merged[event] = kept
  }
  for (const [event, groups] of Object.entries(add)) merged[event] = [...((merged[event] as unknown[] | undefined) ?? []), ...groups]
  const { hooks: _previous, ...rest } = settings
  return Object.keys(merged).length > 0 ? { ...rest, hooks: merged } : rest
}

/** The config.toml text with our managed block replaced (or removed when `block` is null). */
function withBlock(text: string, block: string | null): string {
  const start = text.indexOf(BLOCK_START)
  const end = text.indexOf(BLOCK_END)
  const outside = start === -1 ? text : `${text.slice(0, start)}${text.slice(end + BLOCK_END.length)}`
  if (/^\s*\[\s*mcp_servers\.continuum\s*\]/m.test(outside) || /^\s*\[\s*mcp_servers\.["']continuum["']\s*\]/m.test(outside)) {
    throw new SetupError(`${CODEX_CONFIG_FILE} already has a "${MCP_SERVER_NAME}" server that Continuum did not write; rename or remove it, then run setup again. Nothing was changed.`)
  }
  const base = outside.replace(/\n{3,}/g, '\n\n').trim()
  if (!block) return base === '' ? '' : `${base}\n`
  return `${base === '' ? '' : `${base}\n\n`}${block}\n`
}

function serverBlock(invocation: Invocation): string {
  // JSON strings are valid TOML basic strings.
  const args = [...invocation.args, 'mcp'].map((arg) => JSON.stringify(arg)).join(', ')
  return [BLOCK_START, `[mcp_servers.${MCP_SERVER_NAME}]`, `command = ${JSON.stringify(invocation.command)}`, `args = [${args}]`, BLOCK_END].join('\n')
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

function parseHooksFile(text: string | null): Json | null {
  if (text === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new SetupError(`${CODEX_HOOKS_FILE} is not valid JSON; fix or remove it, then run setup again. Nothing was changed.`)
  }
  if (!isObject(parsed)) throw new SetupError(`${CODEX_HOOKS_FILE} must contain a JSON object. Nothing was changed.`)
  return parsed
}

async function apply(root: string, file: string, before: string | null, after: string, keepOutOfGit: boolean): Promise<FileAction> {
  if (!keepOutOfGit) await removeGitExclude(root, `/${file}`, GIT_EXCLUDE_COMMENT)
  if (before === after) return 'unchanged'
  await writeAtomically(join(root, file), after)
  if (before === null && keepOutOfGit) await addGitExclude(root, `/${file}`, GIT_EXCLUDE_COMMENT)
  return before === null ? 'created' : 'updated'
}

/**
 * Wires Codex to Continuum for one repository: hooks in .codex/hooks.json and
 * the MCP server in a managed block of .codex/config.toml. Codex loads both only
 * once you trust the project, and runs the hooks once you review them (/hooks).
 */
export async function setupCodex(root: string, invocation: Invocation): Promise<SetupResult> {
  const hooksPath = join(root, CODEX_HOOKS_FILE)
  const configPath = join(root, CODEX_CONFIG_FILE)
  const [hooksText, configText, configTracked] = await Promise.all([readText(hooksPath), readText(configPath), isTracked(root, CODEX_CONFIG_FILE)])
  // Compute both results before writing either, so a refusal changes nothing.
  const nextHooks = `${JSON.stringify(mergeHooks(parseHooksFile(hooksText) ?? {}, ourHooks(invocation)), null, 2)}\n`
  const nextConfig = configTracked ? null : withBlock(configText ?? '', serverBlock(invocation))
  const files: SetupResult['files'] = [{ path: CODEX_HOOKS_FILE, action: await apply(root, CODEX_HOOKS_FILE, hooksText, nextHooks, !invocation.portable) }]
  if (nextConfig === null) {
    files.push({
      path: CODEX_CONFIG_FILE,
      action: 'skipped',
      note: `tracked by git and shared with your team, so it was not changed. To add the server for yourself: codex mcp add ${MCP_SERVER_NAME} -- ${commandLine(invocation, 'mcp')}`,
    })
  } else {
    files.push({ path: CODEX_CONFIG_FILE, action: await apply(root, CODEX_CONFIG_FILE, configText, nextConfig, !invocation.portable) })
  }
  return { files }
}

/** Removes only what setupCodex added; files left empty and untracked are deleted. */
export async function removeCodexSetup(root: string): Promise<SetupResult> {
  const files: SetupResult['files'] = []
  const hooksPath = join(root, CODEX_HOOKS_FILE)
  const hooksText = await readText(hooksPath)
  if (hooksText !== null) {
    const after = mergeHooks(parseHooksFile(hooksText) ?? {}, {})
    const text = `${JSON.stringify(after, null, 2)}\n`
    if (text === hooksText) files.push({ path: CODEX_HOOKS_FILE, action: 'unchanged' })
    else {
      if (Object.keys(after).length === 0 && !(await isTracked(root, CODEX_HOOKS_FILE))) {
        await rm(hooksPath)
        await removeGitExclude(root, `/${CODEX_HOOKS_FILE}`, GIT_EXCLUDE_COMMENT)
      } else await writeAtomically(hooksPath, text)
      files.push({ path: CODEX_HOOKS_FILE, action: 'removed' })
    }
  }
  const configPath = join(root, CODEX_CONFIG_FILE)
  const configText = await readText(configPath)
  if (configText !== null && configText.includes(BLOCK_START)) {
    const after = withBlock(configText, null)
    if (after === '' && !(await isTracked(root, CODEX_CONFIG_FILE))) {
      await rm(configPath)
      await removeGitExclude(root, `/${CODEX_CONFIG_FILE}`, GIT_EXCLUDE_COMMENT)
    } else await writeAtomically(configPath, after)
    files.push({ path: CODEX_CONFIG_FILE, action: 'removed' })
  }
  return { files }
}
