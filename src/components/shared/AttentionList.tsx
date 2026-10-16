import { ArrowRightLeft, ChevronRight, CircleDashed, Clock, FlaskConical } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AttentionItem, AttentionKind } from '../../services'

const KIND_META: Record<AttentionKind, { icon: typeof Clock; label: string; className: string }> = {
  'incomplete-task': { icon: CircleDashed, label: 'Incomplete task', className: 'text-warning' },
  'awaiting-verification': { icon: FlaskConical, label: 'Awaiting verification', className: 'text-warning' },
  'handoff-review': { icon: ArrowRightLeft, label: 'Handoff review', className: 'text-accent' },
  'stale-context': { icon: Clock, label: 'Possibly stale', className: 'text-muted' },
}

export function AttentionList({ items, onNavigate }: { items: AttentionItem[]; onNavigate?: () => void }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => {
        const meta = KIND_META[item.kind]
        const Icon = meta.icon
        return (
          <li key={item.id}>
            <Link to={item.to} onClick={onNavigate} className="group flex items-start gap-3 px-1 py-2.5 hover:bg-surface-2/60">
              <Icon className={`mt-0.5 size-4 shrink-0 ${meta.className}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="sr-only">{meta.label}: </span>
                <span className="block text-[13px] font-medium text-fg">{item.title}</span>
                <span className="block truncate text-[12px] text-muted">{item.description}</span>
              </span>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-subtle group-hover:text-fg" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
