export type AgentType = 'claude-code' | 'codex' | 'cursor' | 'chatgpt' | 'other'

export interface AgentInfo {
  id: AgentType
  name: string
  /** Two-letter monogram used in compact agent chips. */
  monogram: string
}
