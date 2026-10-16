/**
 * Geometry and timing for the activity-flow animation. Every animated element
 * shares one cycle; times are fractions of that cycle so they stay in sync.
 */
export const CYCLE_SECONDS = 10

export type FlowStage = 'capture' | 'connect' | 'package'

export const STAGES: readonly { id: FlowStage; label: string; detail: string; from: number; to: number }[] = [
  { id: 'capture', label: 'Capture', detail: 'Session events, file changes and test runs are recorded with their evidence.', from: 0, to: 0.33 },
  { id: 'connect', label: 'Connect', detail: 'Each record is linked to the task, files, decisions and checks it touches.', from: 0.33, to: 0.6 },
  { id: 'package', label: 'Package', detail: 'The connected state is condensed into a handoff for the next agent.', from: 0.6, to: 1 },
]

export function stageAt(fraction: number): FlowStage {
  return (STAGES.find((stage) => fraction >= stage.from && fraction < stage.to) ?? STAGES[STAGES.length - 1]).id
}

export interface Point {
  x: number
  y: number
}

export const GRAPH_NODES = {
  task: { x: 480, y: 128, label: 'task' },
  file: { x: 404, y: 200, label: 'file' },
  decision: { x: 556, y: 200, label: 'decision' },
  check: { x: 480, y: 272, label: 'check' },
} as const

export type GraphNodeId = keyof typeof GRAPH_NODES

export const GRAPH_EDGES: readonly { from: GraphNodeId; to: GraphNodeId; start: number }[] = [
  { from: 'task', to: 'file', start: 0.34 },
  { from: 'task', to: 'check', start: 0.38 },
  { from: 'file', to: 'check', start: 0.42 },
  { from: 'task', to: 'decision', start: 0.46 },
  { from: 'decision', to: 'check', start: 0.5 },
]
export const EDGE_DRAW_DURATION = 0.07

/** When each graph node lights up: on packet arrival, or when an edge recalls it. */
export const NODE_LIGHT_AT: Record<GraphNodeId, number> = { task: 0.22, file: 0.27, check: 0.32, decision: 0.53 }

export type PacketTone = 'accent' | 'ink' | 'success'

export interface Packet {
  id: string
  label: string
  tone: PacketTone
  path: string
  start: number
  end: number
}

export const SOURCES: readonly { id: string; label: string; caption: string; y: number; tone: PacketTone }[] = [
  { id: 'sessions', label: 'Agent session', caption: 'Claude Code', y: 88, tone: 'accent' },
  { id: 'files', label: 'File changes', caption: 'src/auth/*', y: 200, tone: 'ink' },
  { id: 'tests', label: 'Test results', caption: 'npx tsc', y: 312, tone: 'success' },
]

export const INBOUND: readonly Packet[] = [
  { id: 'in-session', label: 'session.end', tone: 'accent', path: 'M206 88 C 300 88, 360 128, 466 128', start: 0.04, end: 0.22 },
  { id: 'in-file', label: 'login.ts', tone: 'ink', path: 'M206 200 L 390 200', start: 0.09, end: 0.27 },
  { id: 'in-test', label: 'tsc ✓', tone: 'success', path: 'M206 312 C 300 312, 360 272, 466 272', start: 0.14, end: 0.32 },
]

export const OUTBOUND: readonly Packet[] = [
  { id: 'out-task', label: 'objective', tone: 'accent', path: 'M494 128 C 620 128, 660 162, 744 162', start: 0.6, end: 0.72 },
  { id: 'out-decision', label: 'constraint', tone: 'ink', path: 'M570 200 L 744 200', start: 0.64, end: 0.76 },
  { id: 'out-check', label: 'checks', tone: 'success', path: 'M494 272 C 620 272, 660 238, 744 238', start: 0.68, end: 0.8 },
]

export const PACKAGE_LINES: readonly { label: string; width: number }[] = [
  { label: 'task', width: 76 },
  { label: 'files', width: 64 },
  { label: 'decisions', width: 52 },
  { label: 'checks', width: 70 },
  { label: 'next', width: 58 },
]
export const PACKAGE_LINE_START = 0.7
export const PACKAGE_LINE_STAGGER = 0.035
export const PACKAGE_LINE_DURATION = 0.05
export const READY_AT = 0.88

/** keyTimes/values for a value that holds `from` until `at`, then steps to `to` and holds. */
export function stepAt(at: number, from: string | number, to: string | number, ramp = 0.02) {
  const end = Math.min(at + ramp, 0.999)
  return { values: `${from};${from};${to};${to}`, keyTimes: `0;${at};${end};1` }
}

/** keyTimes/values for something visible only inside [start, end]. */
export function visibleBetween(start: number, end: number) {
  const fade = 0.006
  return { values: '0;0;1;1;0;0', keyTimes: `0;${start};${start + fade};${end - fade};${end};1` }
}

/** keyTimes/values for a short pulse beginning at `at`. */
export function pulseAt(at: number, length = 0.08) {
  return { keyTimes: `0;${Math.max(at - 0.001, 0)};${at};${Math.min(at + length, 0.999)};1` }
}
