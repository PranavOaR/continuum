import type { ReactNode } from 'react'

/** The numbered label above a section title: `01 —— HOW IT WORKS`. */
export function Eyebrow({ index, children }: { index: string; children: ReactNode }) {
  return (
    <p className="mb-4 flex items-center gap-3 label-mono text-accent">
      <span>{index}</span>
      <span aria-hidden className="h-px w-8 bg-accent/40" />
      <span className="text-muted">{children}</span>
    </p>
  )
}

export function SectionTitle({ children, lead }: { children: ReactNode; lead?: ReactNode }) {
  return (
    <div className="mb-10 max-w-[640px]">
      <h2 className="text-[30px] leading-[1.15] font-normal tracking-display text-fg sm:text-[36px]">{children}</h2>
      {lead && <p className="mt-4 text-[17px] leading-[1.6] text-muted">{lead}</p>}
    </div>
  )
}
