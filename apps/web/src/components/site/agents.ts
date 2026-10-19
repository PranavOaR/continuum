import claudeIcon from '../../assets/agent-logos/claude-color.svg?raw'
import claudeWordmark from '../../assets/agent-logos/claude-text.svg?raw'
import codexIcon from '../../assets/agent-logos/codex-color.svg?raw'
import codexWordmark from '../../assets/agent-logos/codex-text.svg?raw'
import cursorIcon from '../../assets/agent-logos/cursor.svg?raw'
import cursorWordmark from '../../assets/agent-logos/cursor-text.svg?raw'
import { PACKAGE_NAME } from './siteContent'

/**
 * The agents Continuum connects to: their logos (see assets/agent-logos/NOTICE.md),
 * the command that connects each, and what to do next.
 */
export const AGENTS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    icon: claudeIcon,
    wordmark: claudeWordmark,
    next: 'Then start Claude Code in the repository and approve the continuum MCP server.',
  },
  {
    id: 'codex',
    name: 'Codex',
    icon: codexIcon,
    wordmark: codexWordmark,
    next: 'Then start Codex in the repository, trust the project, and review Continuum’s hooks with /hooks.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    icon: cursorIcon,
    wordmark: cursorWordmark,
    next: 'Then open the repository in Cursor and enable the continuum server in Settings → MCP.',
  },
] as const

export type Agent = (typeof AGENTS)[number]

export const setupCommand = (agent: Agent) => `npx ${PACKAGE_NAME} setup ${agent.id}`
