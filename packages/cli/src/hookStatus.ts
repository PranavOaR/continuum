import { readHookHealth, type HookHealth } from '@continuum/capture'
import { connectedHookAgents, type HookAgent } from '@continuum/claude-code'
import { getAgent } from '@continuum/core'

const HOOK_AGENTS: readonly HookAgent[] = ['claude-code', 'codex', 'vscode', 'antigravity']

/** Where to look when an agent's hooks never arrive. */
const NOT_ARRIVING_FIX: Record<HookAgent, string> = {
  'claude-code': 'In Claude Code, run /hooks to check that Continuum is listed, then start a new session.',
  codex: 'In Codex, trust the project and review its hooks with /hooks.',
  vscode: 'In VS Code, turn on the chat.useHooks setting and trust the workspace.',
  antigravity: 'In Antigravity CLI, check that the Continuum hooks are listed and enabled, then start a new conversation.',
}

export interface HookStatus {
  agent: HookAgent
  name: string
  health: HookHealth
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
