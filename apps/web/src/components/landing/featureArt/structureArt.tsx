import { ArtFrame, Twinkle } from './ArtFrame'
import { between, createRandom, round } from './random'

interface ArtProps {
  isAnimated: boolean
}

/* ── Project-aware memory: a slowly rotating cylinder of stacked memory layers ── */

const RING_YS = [20, 29, 38, 47, 56]
const RING_RX = 24
const RING_RY = 7
const DOTS_PER_RING = 24
const RING_SECONDS = 9

function ellipsePath(cy: number) {
  // Starts on the right and sweeps through the front (lower) half first.
  return `M ${40 + RING_RX} ${cy} A ${RING_RX} ${RING_RY} 0 1 1 ${40 - RING_RX} ${cy} A ${RING_RX} ${RING_RY} 0 1 1 ${40 + RING_RX} ${cy}`
}

export function MemoryLayersArt({ isAnimated }: ArtProps) {
  return (
    <ArtFrame isAnimated={isAnimated}>
      <g stroke="white" strokeOpacity={0.25} strokeWidth={0.6}>
        <line x1={16} y1={20} x2={16} y2={56} />
        <line x1={64} y1={20} x2={64} y2={56} />
        <ellipse cx={40} cy={20} rx={RING_RX} ry={RING_RY} strokeDasharray="0.6 2.2" />
      </g>
      {RING_YS.map((cy, ringIndex) => {
        const direction = ringIndex % 2 === 0 ? 1 : -1
        const seconds = RING_SECONDS + ringIndex * 1.3
        return (
          <g key={cy}>
            {Array.from({ length: DOTS_PER_RING }, (_, index) => {
              const fraction = index / DOTS_PER_RING
              const offset = round(fraction * seconds)
              if (!isAnimated) {
                const angle = fraction * Math.PI * 2
                const isFront = Math.sin(angle) > 0
                return (
                  <circle
                    key={index}
                    cx={round(40 + Math.cos(angle) * RING_RX)}
                    cy={round(cy + Math.sin(angle) * RING_RY)}
                    r={0.9}
                    fill="white"
                    opacity={isFront ? 0.95 : 0.3}
                  />
                )
              }
              return (
                <circle key={index} r={0.9} fill="white">
                  <animateMotion
                    dur={`${seconds}s`}
                    begin={`-${offset}s`}
                    repeatCount="indefinite"
                    path={ellipsePath(cy)}
                    keyPoints={direction === 1 ? '0;1' : '1;0'}
                    keyTimes="0;1"
                    calcMode="linear"
                  />
                  <animate
                    attributeName="opacity"
                    values={direction === 1 ? '0.95;0.95;0.25;0.25;0.95' : '0.25;0.25;0.95;0.95;0.25'}
                    keyTimes="0;0.45;0.55;0.95;1"
                    dur={`${seconds}s`}
                    begin={`-${offset}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              )
            })}
          </g>
        )
      })}
    </ArtFrame>
  )
}

/* ── Change tracking: a diff scan that reveals added and removed cells ── */

const GRID = 10
const GRID_START = 13
const GRID_STEP = 6
const SCAN_SECONDS = 3.6
const SCAN_FROM = 8
const SCAN_TO = 72

export function ChangeScanArt({ isAnimated }: ArtProps) {
  const random = createRandom(7)
  const cells = Array.from({ length: GRID * GRID }, (_, index) => {
    const row = Math.floor(index / GRID)
    const col = index % GRID
    const roll = random()
    const change = roll < 0.13 ? 'added' : roll < 0.2 ? 'removed' : 'same'
    return { x: GRID_START + col * GRID_STEP, y: GRID_START + row * GRID_STEP, change }
  })

  return (
    <ArtFrame isAnimated={isAnimated}>
      {cells.map((cell) => {
        const revealAt = round((cell.y - SCAN_FROM) / (SCAN_TO - SCAN_FROM))
        const reveal = { values: '0;0;1;1', keyTimes: `0;${revealAt};${Math.min(revealAt + 0.04, 0.99)};1` }
        if (cell.change === 'same') return <circle key={`${cell.x}-${cell.y}`} cx={cell.x} cy={cell.y} r={0.7} fill="white" opacity={0.35} />
        const isAdded = cell.change === 'added'
        return (
          <g key={`${cell.x}-${cell.y}`}>
            <circle cx={cell.x} cy={cell.y} r={0.7} fill="white" opacity={0.35} />
            <rect
              x={cell.x - 1.9}
              y={cell.y - 1.9}
              width={3.8}
              height={3.8}
              rx={0.8}
              fill={isAdded ? 'white' : 'none'}
              stroke="white"
              strokeWidth={isAdded ? 0 : 0.8}
              opacity={isAnimated ? 0 : 1}
            >
              {isAnimated && <animate attributeName="opacity" {...reveal} dur={`${SCAN_SECONDS}s`} repeatCount="indefinite" />}
            </rect>
          </g>
        )
      })}
      {isAnimated && (
        <g>
          <rect x={6} y={-0.6} width={68} height={1.2} rx={0.6} fill="white" opacity={0.9} />
          <rect x={6} y={-6} width={68} height={6} fill="white" opacity={0.12} />
          <animateTransform attributeName="transform" type="translate" values={`0 ${SCAN_FROM};0 ${SCAN_TO}`} dur={`${SCAN_SECONDS}s`} repeatCount="indefinite" />
        </g>
      )}
    </ArtFrame>
  )
}

/* ── Evidence-backed state: evidence orbits converging on a verified core ── */

const ORBIT_TILTS = [0, 60, 120]
const ORBIT_PATH = 'M 66 40 A 26 9 0 1 1 14 40 A 26 9 0 1 1 66 40'

export function EvidenceOrbitsArt({ isAnimated }: ArtProps) {
  const random = createRandom(23)
  const sparkles = Array.from({ length: 26 }, () => ({
    x: round(between(random, 6, 74)),
    y: round(between(random, 6, 74)),
    dur: round(between(random, 1.6, 3.4)),
    offset: round(between(random, 0, 3)),
  }))

  return (
    <ArtFrame isAnimated={isAnimated}>
      {sparkles.map((sparkle) => (
        <circle key={`${sparkle.x}-${sparkle.y}`} cx={sparkle.x} cy={sparkle.y} r={0.5} fill="white" opacity={0.3}>
          {isAnimated && <Twinkle low={0.1} high={0.7} dur={sparkle.dur} offset={sparkle.offset} />}
        </circle>
      ))}
      {ORBIT_TILTS.map((tilt, orbitIndex) => (
        <g key={tilt} transform={`rotate(${tilt} 40 40)`}>
          <path d={ORBIT_PATH} stroke="white" strokeOpacity={0.45} strokeWidth={0.8} strokeDasharray="0.1 2.4" strokeLinecap="round" />
          {[0, 0.5].map((phase) => {
            const seconds = 4 + orbitIndex * 0.8
            if (!isAnimated) {
              const angle = (phase + orbitIndex * 0.15) * Math.PI * 2
              return <circle key={phase} cx={round(40 + Math.cos(angle) * 26)} cy={round(40 + Math.sin(angle) * 9)} r={1.6} fill="white" />
            }
            return (
              <g key={phase}>
                <circle r={3.4} fill="white" opacity={0.25} />
                <circle r={1.5} fill="white" />
                <animateMotion dur={`${seconds}s`} begin={`-${round(phase * seconds + orbitIndex)}s`} repeatCount="indefinite" path={ORBIT_PATH} />
              </g>
            )
          })}
        </g>
      ))}
      <circle cx={40} cy={40} r={5} fill="white" />
      <path d="M37.6 40.2 L39.4 42 L42.6 38.4" stroke="var(--accent-strong)" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      {isAnimated && (
        <circle cx={40} cy={40} r={5} stroke="white" strokeWidth={0.8}>
          <animate attributeName="r" values="5;16" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}
    </ArtFrame>
  )
}
