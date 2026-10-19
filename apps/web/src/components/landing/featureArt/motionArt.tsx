import { ArtFrame, Twinkle } from './ArtFrame'
import { between, createRandom, pointInDisc, round } from './random'

interface ArtProps {
  isAnimated: boolean
}

/* ── Cross-agent handoffs: context crossing from one agent's cluster to the next ── */

const ARCS = ['M 22 38 C 30 14, 50 14, 58 38', 'M 22 42 C 30 66, 50 66, 58 42']
const TRANSFER_SECONDS = 2.8
const PARTICLES_PER_ARC = 5

function Cluster({ seed, cx, isAnimated }: { seed: number; cx: number; isAnimated: boolean }) {
  const random = createRandom(seed)
  return (
    <g>
      {Array.from({ length: 34 }, () => {
        const point = pointInDisc(random, cx, 40, 11)
        const dur = round(between(random, 1.4, 3))
        const offset = round(between(random, 0, 3))
        return (
          <circle key={`${round(point.x)}-${round(point.y)}`} cx={round(point.x)} cy={round(point.y)} r={0.75} fill="white" opacity={0.6}>
            {isAnimated && <Twinkle low={0.25} high={1} dur={dur} offset={offset} />}
          </circle>
        )
      })}
    </g>
  )
}

export function HandoffTransferArt({ isAnimated }: ArtProps) {
  return (
    <ArtFrame isAnimated={isAnimated}>
      {ARCS.map((arc) => (
        <path key={arc} d={arc} stroke="white" strokeOpacity={0.3} strokeWidth={0.7} strokeDasharray="0.1 2" strokeLinecap="round" />
      ))}
      <Cluster seed={41} cx={20} isAnimated={isAnimated} />
      <Cluster seed={42} cx={60} isAnimated={isAnimated} />
      {isAnimated &&
        ARCS.flatMap((arc, arcIndex) =>
          Array.from({ length: PARTICLES_PER_ARC }, (_, index) => {
            const offset = round((index / PARTICLES_PER_ARC) * TRANSFER_SECONDS + arcIndex * 0.3)
            return (
              <circle key={`${arcIndex}-${index}`} r={1.3} fill="white">
                <animateMotion dur={`${TRANSFER_SECONDS}s`} begin={`-${offset}s`} repeatCount="indefinite" path={arc} />
                <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur={`${TRANSFER_SECONDS}s`} begin={`-${offset}s`} repeatCount="indefinite" />
              </circle>
            )
          }),
        )}
    </ArtFrame>
  )
}

/* ── Code-aware retrieval: a query pulse spreading through a code graph ── */

const GRAPH_SECONDS = 3.6
const HOP_DELAY = 0.17

interface GraphNode {
  x: number
  y: number
}

function buildGraph() {
  const random = createRandom(97)
  const nodes: GraphNode[] = [{ x: 40, y: 40 }]
  while (nodes.length < 15) {
    const candidate = { x: round(between(random, 10, 70)), y: round(between(random, 10, 70)) }
    if (nodes.every((node) => Math.hypot(node.x - candidate.x, node.y - candidate.y) > 11)) nodes.push(candidate)
  }
  const edgeKeys = new Set<string>()
  const edges: [number, number][] = []
  nodes.forEach((node, index) => {
    const nearest = nodes
      .map((other, otherIndex) => ({ otherIndex, distance: Math.hypot(other.x - node.x, other.y - node.y) }))
      .filter((entry) => entry.otherIndex !== index)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2)
    for (const { otherIndex } of nearest) {
      const key = [Math.min(index, otherIndex), Math.max(index, otherIndex)].join('-')
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key)
        edges.push([index, otherIndex])
      }
    }
  })
  // Breadth-first hop count from the query node (index 0) drives the pulse timing.
  const depth = nodes.map(() => Infinity)
  depth[0] = 0
  const queue = [0]
  while (queue.length > 0) {
    const current = queue.shift() as number
    for (const [a, b] of edges) {
      const next = a === current ? b : b === current ? a : -1
      if (next >= 0 && depth[next] === Infinity) {
        depth[next] = depth[current] + 1
        queue.push(next)
      }
    }
  }
  return { nodes, edges, depth: depth.map((value) => (value === Infinity ? 5 : value)) }
}

const GRAPH = buildGraph()

function pulse(hop: number) {
  const at = round(Math.min(hop * HOP_DELAY, 0.8))
  return { keyTimes: `0;${at};${round(at + 0.06)};${round(Math.min(at + 0.3, 0.98))};1` }
}

export function RetrievalGraphArt({ isAnimated }: ArtProps) {
  const { nodes, edges, depth } = GRAPH
  return (
    <ArtFrame isAnimated={isAnimated}>
      {edges.map(([a, b]) => (
        <g key={`${a}-${b}`}>
          <line x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke="white" strokeOpacity={0.22} strokeWidth={0.6} />
          {isAnimated && (
            <line x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke="white" strokeWidth={0.9} opacity={0}>
              <animate attributeName="opacity" values="0;0;0.95;0;0" {...pulse(Math.max(depth[a], depth[b]))} dur={`${GRAPH_SECONDS}s`} repeatCount="indefinite" />
            </line>
          )}
        </g>
      ))}
      {nodes.map((node, index) => (
        <g key={`${node.x}-${node.y}`}>
          <circle cx={node.x} cy={node.y} r={index === 0 ? 2.6 : 1.4} fill="white" opacity={index === 0 ? 1 : 0.55}>
            {isAnimated && index > 0 && (
              <animate attributeName="opacity" values="0.55;0.55;1;0.55;0.55" {...pulse(depth[index])} dur={`${GRAPH_SECONDS}s`} repeatCount="indefinite" />
            )}
          </circle>
          {isAnimated && index === 0 && (
            <circle cx={node.x} cy={node.y} r={2.6} stroke="white" strokeWidth={0.7}>
              <animate attributeName="r" values="2.6;12;12" keyTimes="0;0.35;1" dur={`${GRAPH_SECONDS}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0;0" keyTimes="0;0.35;1" dur={`${GRAPH_SECONDS}s`} repeatCount="indefinite" />
            </circle>
          )}
        </g>
      ))}
    </ArtFrame>
  )
}

/* ── Local-first: a swarm that stays inside the device boundary ── */

export function LocalSwarmArt({ isAnimated }: ArtProps) {
  const random = createRandom(131)
  const particles = Array.from({ length: 46 }, () => {
    const center = pointInDisc(random, 40, 40, 17)
    return {
      x: round(center.x),
      y: round(center.y),
      radius: round(between(random, 2, 5)),
      dur: round(between(random, 3, 6.5)),
      offset: round(between(random, 0, 6)),
      size: round(between(random, 0.5, 1.1)),
      clockwise: random() > 0.5,
    }
  })

  return (
    <ArtFrame isAnimated={isAnimated}>
      <rect x={13} y={13} width={54} height={54} rx={9} stroke="white" strokeOpacity={0.55} strokeWidth={0.8} strokeDasharray="1.5 2.5" />
      <rect x={34} y={34} width={12} height={12} rx={2.5} stroke="white" strokeOpacity={0.9} strokeWidth={0.9} />
      {[0, 1, 2].map((pin) => (
        <g key={pin} stroke="white" strokeOpacity={0.5} strokeWidth={0.6}>
          <line x1={37 + pin * 3} y1={31} x2={37 + pin * 3} y2={34} />
          <line x1={37 + pin * 3} y1={46} x2={37 + pin * 3} y2={49} />
        </g>
      ))}
      {particles.map((particle) => {
        const sweep = particle.clockwise ? 1 : 0
        const r = particle.radius
        const orbit = `M ${particle.x + r} ${particle.y} A ${r} ${r} 0 1 ${sweep} ${particle.x - r} ${particle.y} A ${r} ${r} 0 1 ${sweep} ${particle.x + r} ${particle.y}`
        if (!isAnimated) return <circle key={`${particle.x}-${particle.y}`} cx={particle.x} cy={particle.y} r={particle.size} fill="white" opacity={0.7} />
        return (
          <circle key={`${particle.x}-${particle.y}`} r={particle.size} fill="white">
            <animateMotion dur={`${particle.dur}s`} begin={`-${particle.offset}s`} repeatCount="indefinite" path={orbit} />
            <Twinkle low={0.35} high={1} dur={particle.dur / 2} offset={particle.offset} />
          </circle>
        )
      })}
    </ArtFrame>
  )
}
