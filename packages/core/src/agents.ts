import type { AgentInfo, AgentType } from './types'

export const AGENTS: readonly AgentInfo[] = [
  { id: 'claude-code', name: 'Claude Code', monogram: 'CC' },
  { id: 'codex', name: 'Codex', monogram: 'CX' },
  { id: 'cursor', name: 'Cursor', monogram: 'CU' },
  { id: 'vscode', name: 'VS Code Copilot', monogram: 'VS' },
  { id: 'chatgpt', name: 'ChatGPT', monogram: 'GP' },
  { id: 'other', name: 'Other agent', monogram: 'OT' },
]

export function getAgent(id: AgentType): AgentInfo {
  return AGENTS.find((agent) => agent.id === id) ?? AGENTS[AGENTS.length - 1]
}
