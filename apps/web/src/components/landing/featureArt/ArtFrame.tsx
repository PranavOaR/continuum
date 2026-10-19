import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * The accent tile that hosts a feature animation. Pauses its SMIL timeline while
 * off-screen so six looping tiles cost nothing when they are not visible.
 */
export function ArtFrame({ isAnimated, children }: { isAnimated: boolean; children: ReactNode }) {
  const ref = useRef<SVGSVGElement>(null)
  const grainId = useId()

  useEffect(() => {
    const svg = ref.current
    if (!svg || !isAnimated) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) svg.unpauseAnimations()
      else svg.pauseAnimations()
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [isAnimated])

  return (
    <div aria-hidden className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-accent-strong shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(255_255_255/0.22),transparent_60%),linear-gradient(160deg,transparent_45%,rgb(20_10_90/0.35))]" />
      <svg ref={ref} viewBox="0 0 80 80" className="relative block size-full" fill="none">
        <defs>
          <pattern id={grainId} width={3} height={3} patternUnits="userSpaceOnUse">
            <circle cx={1.5} cy={1.5} r={0.32} fill="white" />
          </pattern>
        </defs>
        {/* Fine dither grain gives the tile texture beneath the animated layer. */}
        <rect width={80} height={80} fill={`url(#${grainId})`} opacity={0.14} />
        {children}
      </svg>
    </div>
  )
}

/** Looping opacity flicker; a negative begin starts each dot mid-cycle so they never sync up. */
export function Twinkle({ low, high, dur, offset }: { low: number; high: number; dur: number; offset: number }) {
  return <animate attributeName="opacity" values={`${low};${high};${low}`} dur={`${dur}s`} begin={`-${offset}s`} repeatCount="indefinite" />
}
