/**
 * The numbers on the home page. Every one is measured, never estimated:
 * re-run `npm run bench:hooks` (latency) and `npm run bench:scan` (working tree)
 * on a quiet machine and update them together, with MEASURED.
 */
export const MEASURED = {
  machine: 'an Apple M4 MacBook (macOS, Node.js 26)',
  date: '3 November 2026',
  runs: 21,
  repository: '2,000 files and 10,000 recorded events',
}

export interface LatencyRow {
  label: string
  detail: string
  /** Null when there is nothing to measure in process (the work runs in the background). */
  inProcessMs: number | null
  endToEndMs: number
}

export const LATENCY: readonly LatencyRow[] = [
  {
    label: 'Briefing at session start',
    detail: 'Where the work left off, judged against the code as it is now, before the agent’s first turn.',
    inProcessMs: 29,
    endToEndMs: 124,
  },
  {
    label: 'One file edit recorded',
    detail: 'Runs in the background: the agent never waits for it.',
    inProcessMs: null,
    endToEndMs: 113,
  },
]

export interface ScaleStat {
  value: string
  unit: string
  label: string
}

export const SCALE: readonly ScaleStat[] = [
  { value: '79', unit: 'ms', label: 'to read a 50,000-file working tree, with 50 files changed' },
  { value: '0.9', unit: 'MB', label: 'for the whole CLI, hooks and MCP server, in one file' },
  { value: '0', unit: 'requests', label: 'leave your machine: no account, no telemetry, no cloud' },
]
