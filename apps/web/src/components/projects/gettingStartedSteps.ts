import { getAgent, type AgentType, type ProjectWorkspace } from '@continuum/core'

export interface GettingStartedStep {
  id: string
  title: string
  done: boolean
  /** What to do, with an optional command to run in the repository. */
  hint: string
  command?: string
}

const SETUP_COMMAND = 'continuum setup claude-code'
const VERIFIED_RUN = 'continuum run -- npm test'
const RECORDED = 'Each session is recorded as you work.'

/** How a session starts for a connected agent: each one asks for something different the first time. */
const SESSION_HINT: Partial<Record<AgentType, Pick<GettingStartedStep, 'hint' | 'command'>>> = {
  'claude-code': { hint: `Start Claude Code in the repository and approve the "continuum" MCP server. ${RECORDED}` },
  codex: { hint: `Start Codex in the repository and trust the project, then run /hooks and trust Continuum's hooks. ${RECORDED}` },
  vscode: { hint: `Open the repository in VS Code, trust the workspace and start the "continuum" MCP server. ${RECORDED}` },
  antigravity: { hint: `Start Antigravity CLI (agy) in the repository. ${RECORDED}` },
  // Cursor has no hooks, so nothing records a session until you open one.
  cursor: { hint: 'Enable the "continuum" MCP server in Cursor\'s settings. Cursor has no hooks, so open a session to record its work:', command: 'continuum session start --agent cursor' },
}

/** Each step is judged from live records, so it ticks itself off as the work happens. */
export function gettingStartedSteps(workspace: ProjectWorkspace): GettingStartedStep[] {
  const connected = workspace.setup?.connectedAgents ?? []
  const [agent] = connected
  return [
    {
      id: 'connect',
      title: 'Connect an agent',
      done: connected.length > 0,
      hint: 'In the repository, run this, with codex, cursor or vscode in place of claude-code if you use one of those:',
      command: SETUP_COMMAND,
    },
    {
      id: 'session',
      title: agent ? `Work in a ${getAgent(agent).name} session` : 'Work in an agent session',
      done: workspace.sessions.length > 0,
      ...((agent && SESSION_HINT[agent]) ?? { hint: `Start your agent in the repository. ${RECORDED}` }),
    },
    {
      id: 'task',
      title: 'Record what you are working on',
      done: workspace.tasks.length > 0,
      hint: 'Ask your agent to "start a Continuum task for this"; it records the objective, steps and next action with start_task.',
    },
    {
      id: 'check',
      title: 'Record a check',
      done: workspace.verification.length > 0,
      // Only Claude Code reports exit codes to its hooks.
      hint: connected.includes('claude-code') ? 'Tests Claude Code runs are recorded automatically. To record a verified run yourself:' : 'Run your tests through Continuum to record a verified result:',
      command: VERIFIED_RUN,
    },
  ]
}
