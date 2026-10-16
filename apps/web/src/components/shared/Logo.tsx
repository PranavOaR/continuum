import { cn } from '../../utils/cn'

/** A continuous thread through three states: where work started, the handoff point, and where it continues. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn('size-6', className)}>
      <path d="M6 22C6 13 16 11 16 16s10 3 10-6" className="stroke-fg" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="6" cy="22" r="3" className="fill-bg stroke-fg" strokeWidth="2" />
      <circle cx="16" cy="16" r="1.9" className="fill-fg" />
      <circle cx="26" cy="10" r="3.4" className="fill-accent" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-[18px] font-medium tracking-[-0.035em] text-fg">continuum</span>
    </span>
  )
}
