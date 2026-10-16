import type { GraphNode, GraphNodeType } from '../../types'

export const NODE_WIDTH = 176
export const NODE_HEIGHT = 36
const COLUMN_GAP = 64
const ROW_GAP = 14
const PADDING = 20

/** Left-to-right reading order: who/what → task → constraints & checks → files → symbols. */
const COLUMNS: GraphNodeType[][] = [['project', 'session'], ['task'], ['decision', 'verification'], ['file'], ['symbol']]

export interface PositionedNode extends GraphNode {
  x: number
  y: number
}

export interface GraphLayout {
  nodes: PositionedNode[]
  width: number
  height: number
}

export function layoutGraph(nodes: GraphNode[]): GraphLayout {
  const columns = COLUMNS.map((types) => types.flatMap((type) => nodes.filter((node) => node.type === type)))
  const tallest = Math.max(1, ...columns.map((column) => column.length))
  const height = PADDING * 2 + tallest * NODE_HEIGHT + (tallest - 1) * ROW_GAP

  const positioned = columns.flatMap((column, columnIndex) => {
    const columnHeight = column.length * NODE_HEIGHT + Math.max(0, column.length - 1) * ROW_GAP
    const top = (height - columnHeight) / 2
    return column.map((node, rowIndex) => ({
      ...node,
      x: PADDING + columnIndex * (NODE_WIDTH + COLUMN_GAP),
      y: top + rowIndex * (NODE_HEIGHT + ROW_GAP),
    }))
  })

  return { nodes: positioned, width: PADDING * 2 + COLUMNS.length * NODE_WIDTH + (COLUMNS.length - 1) * COLUMN_GAP, height }
}

export function edgePath(from: PositionedNode, to: PositionedNode): string {
  const [left, right] = from.x <= to.x ? [from, to] : [to, from]
  const x1 = left.x + NODE_WIDTH
  const y1 = left.y + NODE_HEIGHT / 2
  const x2 = right.x
  const y2 = right.y + NODE_HEIGHT / 2
  const bend = Math.max(24, (x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
}
