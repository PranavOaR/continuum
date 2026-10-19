import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '../../utils/cn'
import { AGENTS, setupCommand } from './agents'
import { InstallCommand } from './InstallCommand'

/** Inline, so monochrome logos take the text colour. The SVGs are bundled files, never user input. */
function Svg({ markup, className }: { markup: string; className: string }) {
  return <span aria-hidden className={`inline-flex [&>svg]:h-full [&>svg]:w-auto ${className}`} dangerouslySetInnerHTML={{ __html: markup }} />
}

/** Pick an agent by its logo, get the exact command that connects it, and what to do next. */
export function AgentPicker({ label }: { label?: string }) {
  const [selected, setSelected] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const agent = AGENTS[selected]

  // Arrow keys move between agents, as in any tab list.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = (selected + step + AGENTS.length) % AGENTS.length
    setSelected(next)
    tabs.current[next]?.focus()
  }

  return (
    <div className="max-w-[560px]">
      {label && <p className="mb-3 label-mono text-subtle">{label}</p>}
      <div role="tablist" aria-label="Choose your agent" className="flex flex-wrap gap-1 sm:gap-2" onKeyDown={onKeyDown}>
        {AGENTS.map((candidate, index) => {
          const isSelected = index === selected
          return (
            <button
              key={candidate.id}
              ref={(element) => {
                tabs.current[index] = element
              }}
              type="button"
              role="tab"
              id={`${id}-${candidate.id}`}
              aria-selected={isSelected}
              aria-controls={`${id}-panel`}
              aria-label={candidate.name}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelected(index)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-fg transition-[background-color,border-color,opacity] sm:h-10 sm:gap-2 sm:px-3',
                isSelected ? 'border-line-strong bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.05)]' : 'border-transparent opacity-55 hover:opacity-90',
              )}
            >
              <Svg markup={candidate.icon} className="h-[16px] sm:h-[19px]" />
              <Svg markup={candidate.wordmark} className="h-[12px] sm:h-[15px]" />
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${agent.id}`} className="mt-3">
        <InstallCommand command={setupCommand(agent)} />
        <p className="mt-2.5 text-[13px] leading-[1.5] text-subtle">{agent.next}</p>
      </div>
    </div>
  )
}
