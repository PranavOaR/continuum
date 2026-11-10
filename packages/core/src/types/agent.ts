export type AgentType = 'claude-code' | 'codex' | 'cursor' | 'vscode' | 'antigravity' | 'chatgpt' | 'other'

export interface AgentInfo {
  id: AgentType
  name: string
  /** Two-letter monogram used in compact agent chips. */
  monogram: string
}
