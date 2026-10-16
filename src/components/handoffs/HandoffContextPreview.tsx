import { FileText } from 'lucide-react'
import type { HandoffContext } from '../../utils/buildHandoffContext'
import { Badge } from '../shared/Badge'
import { EmptyState } from '../shared/States'

export function TokenEstimate({ tokens }: { tokens: number }) {
  return (
    <Badge tone="muted" title="Rough estimate: characters ÷ 4. Not measured with a model tokenizer.">
      ≈ {tokens.toLocaleString()} tokens (estimate)
    </Badge>
  )
}

/** Structured, read-only rendering of the context that will be copied. */
export function HandoffContextPreview({ context, compact = false }: { context: HandoffContext; compact?: boolean }) {
  if (context.sections.length === 0) {
    return <EmptyState icon={<FileText />} title="No context selected" description="Choose at least one category to include in the handoff." />
  }
  return (
    <div className="space-y-3">
      {context.sections.map((section) => (
        <section key={section.category} className="rounded-md border border-line bg-surface-2/50 p-3">
          <h3 className="mb-1.5 label-mono text-muted ">{section.title}</h3>
          {section.items.length === 0 ? (
            <p className="text-[12px] text-subtle italic">None recorded for this task.</p>
          ) : (
            <ul className="space-y-1">
              {(compact ? section.items.slice(0, 4) : section.items).map((item) => (
                <li key={item} className="flex gap-2 text-[12.5px] leading-snug text-fg">
                  <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-subtle" />
                  <span className="min-w-0 break-words">{item}</span>
                </li>
              ))}
              {compact && section.items.length > 4 && <li className="pl-3 text-[12px] text-muted">+ {section.items.length - 4} more</li>}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
