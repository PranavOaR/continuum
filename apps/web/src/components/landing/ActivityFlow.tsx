import { FileCode2, FlaskConical, Pause, Play, Terminal } from 'lucide-react'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { cn } from '../../utils/cn'
import {
  CYCLE_SECONDS,
  EDGE_DRAW_DURATION,
  GRAPH_EDGES,
  GRAPH_NODES,
  INBOUND,
  NODE_LIGHT_AT,
  OUTBOUND,
  PACKAGE_LINES,
  PACKAGE_LINE_DURATION,
  PACKAGE_LINE_STAGGER,
  PACKAGE_LINE_START,
  READY_AT,
  SOURCES,
  STAGES,
  pulseAt,
  stageAt,
  stepAt,
  visibleBetween,
  type FlowStage,
  type GraphNodeId,
  type Packet,
  type PacketTone,
} from './flowTimeline'

const DUR = `${CYCLE_SECONDS}s`
const STAGE_POLL_MS = 150
const TONE_FILL: Record<PacketTone, string> = { accent: 'fill-accent', ink: 'fill-fg', success: 'fill-success' }
const SOURCE_ICON = { sessions: Terminal, files: FileCode2, tests: FlaskConical } as const

/** A SMIL <animate> that loops on the shared cycle. Rendered only when motion is allowed. */
function Loop({ attr, values, keyTimes }: { attr: string; values: string; keyTimes: string }) {
  return <animate attributeName={attr} values={values} keyTimes={keyTimes} dur={DUR} repeatCount="indefinite" />
}

function PacketGlyph({ packet }: { packet: Packet }) {
  const labelWidth = packet.label.length * 6.1 + 12
  const visibility = visibleBetween(packet.start, packet.end)
  return (
    <g opacity={0}>
      <rect x={-5} y={-5} width={10} height={10} rx={2.5} className={TONE_FILL[packet.tone]} />
      <rect x={9} y={-21} width={labelWidth} height={16} rx={8} className="fill-surface stroke-line-strong" strokeWidth={1} />
      <text x={15} y={-9.5} className="fill-fg font-mono text-[10px]">
        {packet.label}
      </text>
      <animateMotion dur={DUR} repeatCount="indefinite" path={packet.path} keyPoints="0;0;1;1" keyTimes={`0;${packet.start};${packet.end};1`} calcMode="linear" />
      <Loop attr="opacity" {...visibility} />
    </g>
  )
}

function Sources({ isAnimated }: { isAnimated: boolean }) {
  return (
    <g>
      {SOURCES.map((source, index) => {
        const Icon = SOURCE_ICON[source.id as keyof typeof SOURCE_ICON]
        const emit = INBOUND[index]
        return (
          <g key={source.id}>
            <rect x={40} y={source.y - 28} width={166} height={56} rx={10} className="fill-surface stroke-line" strokeWidth={1} />
            <Icon x={54} y={source.y - 9} width={18} height={18} className="text-muted" aria-hidden />
            <text x={84} y={source.y - 2} className="fill-fg text-[13px]">
              {source.label}
            </text>
            <text x={84} y={source.y + 14} className="fill-subtle font-mono text-[10px]">
              {source.caption}
            </text>
            <circle cx={206} cy={source.y} r={4} className={TONE_FILL[source.tone]}>
              {isAnimated && <Loop attr="r" values="4;4;7;4;4" {...pulseAt(emit.start, 0.05)} />}
            </circle>
          </g>
        )
      })}
    </g>
  )
}

function Rails() {
  return (
    <g fill="none" className="stroke-line-strong" strokeWidth={1} strokeDasharray="3 5">
      {[...INBOUND, ...OUTBOUND].map((packet) => (
        <path key={packet.id} d={packet.path} />
      ))}
    </g>
  )
}

function Core({ isAnimated }: { isAnimated: boolean }) {
  const node = (id: GraphNodeId) => GRAPH_NODES[id]
  return (
    <g>
      <rect x={300} y={40} width={320} height={320} rx={16} className="fill-surface stroke-line-strong" strokeWidth={1} />
      <rect x={300} y={40} width={320} height={320} rx={16} className="fill-accent" opacity={0.035} />
      <text x={322} y={68} className="fill-fg font-mono text-[11px] tracking-[0.06em]">
        CONTINUUM
      </text>
      <text x={598} y={68} textAnchor="end" className="fill-subtle font-mono text-[10px]">
        project state
      </text>

      {GRAPH_EDGES.map((edge) => {
        const from = node(edge.from)
        const to = node(edge.to)
        return (
          <g key={`${edge.from}-${edge.to}`}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="stroke-line" strokeWidth={1} />
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={isAnimated ? 1 : 0}
              className="stroke-accent"
              strokeWidth={1.6}
            >
              {isAnimated && <Loop attr="stroke-dashoffset" {...stepAt(edge.start, 1, 0, EDGE_DRAW_DURATION)} />}
            </line>
          </g>
        )
      })}

      {(Object.keys(GRAPH_NODES) as GraphNodeId[]).map((id) => {
        const { x, y, label } = node(id)
        const at = NODE_LIGHT_AT[id]
        return (
          <g key={id}>
            {isAnimated && (
              <circle cx={x} cy={y} r={14} fill="none" className="stroke-accent" strokeWidth={1.5} opacity={0}>
                <Loop attr="r" values="14;14;14;30;30" {...pulseAt(at)} />
                <Loop attr="opacity" values="0;0;0.6;0;0" {...pulseAt(at)} />
              </circle>
            )}
            <circle cx={x} cy={y} r={14} className="fill-surface stroke-line-strong" strokeWidth={1} />
            <circle cx={x} cy={y} r={14} className="fill-accent" opacity={isAnimated ? 0 : 1}>
              {isAnimated && <Loop attr="opacity" {...stepAt(at, 0, 1)} />}
            </circle>
            <circle cx={x} cy={y} r={3.5} className="fill-surface" />
            <text x={x} y={y + 30} textAnchor="middle" className="fill-muted font-mono text-[10px]">
              {label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function HandoffPackage({ isAnimated }: { isAnimated: boolean }) {
  return (
    <g>
      <rect x={744} y={80} width={180} height={240} rx={12} className="fill-surface stroke-line-strong" strokeWidth={1} />
      <text x={762} y={108} className="fill-fg font-mono text-[11px]">
        handoff.md
      </text>
      <text x={906} y={108} textAnchor="end" className="fill-subtle font-mono text-[10px]">
        → Codex
      </text>
      <line x1={744} y1={122} x2={924} y2={122} className="stroke-line" strokeWidth={1} />

      {PACKAGE_LINES.map((line, index) => {
        const y = 148 + index * 26
        const start = PACKAGE_LINE_START + index * PACKAGE_LINE_STAGGER
        return (
          <g key={line.label}>
            <text x={762} y={y + 4} className="fill-subtle font-mono text-[9px]">
              ## {line.label}
            </text>
            <rect x={834} y={y - 3} width={line.width} height={6} rx={3} className="fill-surface-3" />
            <rect x={834} y={y - 3} width={isAnimated ? 0 : line.width} height={6} rx={3} className="fill-accent">
              {isAnimated && <Loop attr="width" {...stepAt(start, 0, line.width, PACKAGE_LINE_DURATION)} />}
            </rect>
          </g>
        )
      })}

      <g opacity={isAnimated ? 0 : 1}>
        <rect x={760} y={282} width={148} height={24} rx={12} className="fill-accent" />
        <text x={834} y={298} textAnchor="middle" className="fill-accent-fg text-[11px] font-medium">
          Ready to copy
        </text>
        {isAnimated && <Loop attr="opacity" {...stepAt(READY_AT, 0, 1, 0.03)} />}
      </g>
    </g>
  )
}

/** Tracks which stage the SMIL timeline is in, and pauses it off-screen or on request. */
function useFlowPlayback(svg: RefObject<SVGSVGElement | null>, isAnimated: boolean) {
  const [stage, setStage] = useState<FlowStage>('capture')
  const [isPaused, setPaused] = useState(false)
  const [isVisible, setVisible] = useState(true)

  useEffect(() => {
    const element = svg.current
    if (!element || !isAnimated) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(element)
    return () => observer.disconnect()
  }, [svg, isAnimated])

  useEffect(() => {
    const element = svg.current
    if (!element || !isAnimated) return
    if (isPaused || !isVisible) element.pauseAnimations()
    else element.unpauseAnimations()
  }, [svg, isAnimated, isPaused, isVisible])

  useEffect(() => {
    if (!isAnimated) return
    const timer = window.setInterval(() => {
      const element = svg.current
      if (element) setStage(stageAt((element.getCurrentTime() % CYCLE_SECONDS) / CYCLE_SECONDS))
    }, STAGE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [svg, isAnimated])

  return { stage, isPaused, togglePaused: () => setPaused((paused) => !paused) }
}

export function ActivityFlow() {
  const isAnimated = !useReducedMotion()
  const svgRef = useRef<SVGSVGElement>(null)
  const { stage, isPaused, togglePaused } = useFlowPlayback(svgRef, isAnimated)
  const titleId = useId()
  const descId = useId()

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="flex items-center gap-2 label-mono text-muted">
          <span aria-hidden className={cn('size-1.5 rounded-full', isAnimated && !isPaused ? 'animate-pulse bg-live' : 'bg-subtle')} />
          {isAnimated ? 'One session, flowing into a handoff' : 'Activity flow (motion reduced)'}
        </p>
        {isAnimated && (
          <button
            type="button"
            onClick={togglePaused}
            aria-pressed={isPaused}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-[12px] text-muted hover:border-line-strong hover:text-fg [&_svg]:size-3.5"
          >
            {isPaused ? <Play aria-hidden /> : <Pause aria-hidden />}
            {isPaused ? 'Play' : 'Pause'}
          </button>
        )}
      </div>

      <div className="cn-dots overflow-x-auto">
        <svg ref={svgRef} viewBox="0 0 960 400" role="img" aria-labelledby={`${titleId} ${descId}`} className="block h-auto w-full min-w-[640px]">
          <title id={titleId}>How activity flows through Continuum into a handoff package</title>
          <desc id={descId}>
            Events from an agent session, file changes and test results enter Continuum, are linked into a graph of task, file, decision and check, and
            are condensed into a handoff document for the next agent.
          </desc>
          <Rails />
          <Sources isAnimated={isAnimated} />
          <Core isAnimated={isAnimated} />
          <HandoffPackage isAnimated={isAnimated} />
          {isAnimated && [...INBOUND, ...OUTBOUND].map((packet) => <PacketGlyph key={packet.id} packet={packet} />)}
        </svg>
      </div>

      <ol className="grid border-t border-line sm:grid-cols-3">
        {STAGES.map((step, index) => {
          const isActive = isAnimated && step.id === stage
          return (
            <li
              key={step.id}
              aria-current={isActive ? 'step' : undefined}
              className={cn('relative border-line px-4 py-3.5 transition-colors sm:border-l sm:first:border-l-0', index > 0 && 'border-t sm:border-t-0', isActive && 'bg-accent/[0.05]')}
            >
              <span aria-hidden className={cn('absolute top-0 left-0 h-0.5 bg-accent transition-all duration-500', isActive ? 'w-full' : 'w-0')} />
              <p className="flex items-center gap-2 text-[14px] font-medium text-fg">
                <span className={cn('font-mono text-[11px]', isActive ? 'text-accent' : 'text-subtle')}>0{index + 1}</span>
                {step.label}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-muted">{step.detail}</p>
            </li>
          )
        })}
      </ol>
      <figcaption className="sr-only">Illustrative animation of how a session flows through Continuum into a handoff.</figcaption>
    </figure>
  )
}
