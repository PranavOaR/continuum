import claudeIcon from '../../assets/agent-logos/claude-color.svg?raw'
import claudeWordmark from '../../assets/agent-logos/claude-text.svg?raw'
import codexIcon from '../../assets/agent-logos/codex-color.svg?raw'
import codexWordmark from '../../assets/agent-logos/codex-text.svg?raw'
import cursorIcon from '../../assets/agent-logos/cursor.svg?raw'
import cursorWordmark from '../../assets/agent-logos/cursor-text.svg?raw'

/** The agents Continuum connects to, as their own logos (see assets/agent-logos/NOTICE.md). */
const LOGOS = [
  { name: 'Claude Code', icon: claudeIcon, wordmark: claudeWordmark },
  { name: 'Codex', icon: codexIcon, wordmark: codexWordmark },
  { name: 'Cursor', icon: cursorIcon, wordmark: cursorWordmark },
] as const

/** Inline, so monochrome logos take the text colour in both themes. The SVGs are bundled files, never user input. */
function Svg({ markup, className }: { markup: string; className: string }) {
  return <span aria-hidden className={`inline-flex [&>svg]:h-full [&>svg]:w-auto ${className}`} dangerouslySetInnerHTML={{ __html: markup }} />
}

export function AgentLogos() {
  return (
    <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {LOGOS.map((logo) => (
        <li key={logo.name} role="img" aria-label={logo.name} title={logo.name} className="flex items-center gap-2 text-fg">
          <Svg markup={logo.icon} className="h-[22px]" />
          <Svg markup={logo.wordmark} className="h-[17px]" />
        </li>
      ))}
    </ul>
  )
}
