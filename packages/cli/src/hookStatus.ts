import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readHookHealth, type HookHealth } from '@continuum/capture'
import { CODEX_HOOKS_FILE, HOOKS_FILE, isContinuumHandler, VSCODE_HOOKS_FILE, type HookAgent } from '@continuum/claude-code'
import { getAgent } from '@continuum/core'

const HOOK_AGENTS: readonly HookAgent[] = ['claude-code', 'codex', 'vscode']

/** Where to look when an agent's hooks never arrive. */
const NOT_ARRIVING_FIX: Record<HookAgent, string> = {
  'claude-code': 'In Claude Code, run /hooks to check that Continuum is listed, then start a new session.',
  codex: 'In Codex, trust the project and review its hooks with /hooks.',
  vscode: 'In VS Code, turn on the chat.useHooks setting and trust the workspace.',
}

export interface HookStatus {
  agent: HookAgent
  name: string
  health: HookHealth
}

/** The file's text, or '' when it is missing or unreadable: doctor reports broken agent configs on its own. */
async function text(path: string): Promise<string> {
  if (!existsSync(path)) return ''
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const entries = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

function hasClaudeCodeHooks(settings: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(settings)
  } catch {
    return false
  }
  const hooks = isObject(parsed) && isObject(parsed.hooks) ? parsed.hooks : {}
  return Object.values(hooks)
    .flatMap(entries)
    .flatMap((group) => (isObject(group) ? entries(group.hooks) : []))
    .some((handler) => isObject(handler) && isContinuumHandler(handler))
}

/** Agents whose hooks this repository's own config files run Continuum from. */
async function connectedHookAgents(root: string): Promise<Set<HookAgent>> {
  const [claude, codex, vscode] = await Promise.all([HOOKS_FILE, CODEX_HOOKS_FILE, VSCODE_HOOKS_FILE].map((file) => text(join(root, file))))
  const connected = new Set<HookAgent>()
  if (hasClaudeCodeHooks(claude)) connected.add('claude-code')
  if (codex.includes('ingest --agent codex')) connected.add('codex')
  if (vscode.includes('ingest --agent vscode')) connected.add('vscode')
  return connected
}

/**
 * Each agent that is connected here or has sent a hook (the Claude Code plugin
 * installs its hooks outside the repository), with whether its hooks arrive.
 */
export async function hookStatuses(root: string): Promise<HookStatus[]> {
  const connected = await connectedHookAgents(root)
  const statuses = await Promise.all(HOOK_AGENTS.map(async (agent) => ({ agent, name: getAgent(agent).name, health: await readHookHealth(root, agent) })))
  return statuses.filter(({ agent, health }) => connected.has(agent) || health.lastArrivalAt !== null || health.lastFailure !== null)
}

export const notArrivingFix = (agent: HookAgent) => NOT_ARRIVING_FIX[agent]
