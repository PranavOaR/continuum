import { cn } from '../../utils/cn'

/** A continuous thread through three states: where work started, the handoff point, and where it continues. */
export function LogoMark({ className, onWhite = false }: { className?: string; onWhite?: boolean }) {
  // `onWhite` pins the ink colours for use inside always-white surfaces, regardless of theme.
  const ink = onWhite ? 'stroke-[#0b1015]' : 'stroke-fg'
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn('size-6', className)}>
      <path d="M6 22C6 13 16 11 16 16s10 3 10-6" className={ink} strokeWidth="2.6" strokeLinecap="square" />
      <rect x="3" y="19" width="6" height="6" className={cn(ink, onWhite ? 'fill-white' : 'fill-bg')} strokeWidth="2" />
      <rect x="14.25" y="14.25" width="3.5" height="3.5" className={onWhite ? 'fill-[#0b1015]' : 'fill-fg'} />
      <rect x="22.5" y="6.5" width="7" height="7" className="fill-accent" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-[19px] font-medium tracking-[-0.04em] text-fg">continuum</span>
    </span>
  )
}
