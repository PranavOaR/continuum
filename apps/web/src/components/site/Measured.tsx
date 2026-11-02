import { AGENTS } from './agents'
import { Eyebrow, SectionTitle } from './SectionHeading'
import { LATENCY, MEASURED, SCALE, type ScaleStat } from './siteStats'

/** A measured number: large, with its unit set small beside it. */
function Figure({ value, unit, size = 'lg' }: { value: string | number; unit: string; size?: 'lg' | 'md' }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap text-fg tabular-nums">
      <span className={size === 'lg' ? 'text-[36px] leading-none tracking-display sm:text-[44px]' : 'text-[28px] leading-none tracking-display sm:text-[36px]'}>{value}</span>
      <span className="font-mono text-[13px] text-subtle">{unit}</span>
    </span>
  )
}

const LATENCY_CAPTION = `Hook latency, median of ${MEASURED.runs} runs`

/** Phones: each row stacked, its figures labelled, instead of a table too narrow to read. */
function LatencyList() {
  return (
    <div className="cn-thread overflow-hidden rounded-lg border border-line bg-bg sm:hidden">
      <p className="border-b border-line px-5 py-4 label-mono text-muted">{LATENCY_CAPTION}</p>
      <ul className="divide-y divide-line">
        {LATENCY.map((row) => (
          <li key={row.label} className="px-5 py-6">
            <p className="text-[16px] tracking-[-0.01em] text-fg">{row.label}</p>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-muted">{row.detail}</p>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <dt className="label-mono text-subtle">In process</dt>
                <dd className="mt-2">{row.inProcessMs === null ? <span className="label-mono text-subtle">background</span> : <Figure value={row.inProcessMs} unit="ms" size="md" />}</dd>
              </div>
              <div>
                <dt className="label-mono text-subtle">End to end</dt>
                <dd className="mt-2">
                  <Figure value={row.endToEndMs} unit="ms" size="md" />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LatencyTable() {
  return (
    <div className="cn-thread hidden overflow-hidden rounded-lg border border-line bg-bg sm:block">
      <table className="w-full border-collapse text-left">
        <caption className="border-b border-line px-5 py-4 text-left label-mono text-muted sm:px-6">{LATENCY_CAPTION}</caption>
        <thead>
          <tr className="border-b border-line label-mono text-subtle">
            <th scope="col" className="px-5 py-3 font-normal sm:px-6">
              <span className="sr-only">Work</span>
            </th>
            <th scope="col" className="px-3 py-3 text-right font-normal sm:px-6">In process</th>
            <th scope="col" className="px-5 py-3 text-right font-normal sm:px-6">End to end</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {LATENCY.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="px-5 py-6 align-top font-normal sm:px-6">
                <span className="block text-[16px] tracking-[-0.01em] text-fg">{row.label}</span>
                <span className="mt-1.5 block max-w-[420px] text-[13px] leading-[1.5] text-muted">{row.detail}</span>
              </th>
              <td className="px-3 py-6 text-right align-top sm:px-6">
                {row.inProcessMs === null ? <span className="label-mono text-subtle">background</span> : <Figure value={row.inProcessMs} unit="ms" size="md" />}
              </td>
              <td className="px-5 py-6 text-right align-top sm:px-6">
                <Figure value={row.endToEndMs} unit="ms" size="md" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const AGENT_STAT: ScaleStat = { value: String(AGENTS.length), unit: 'agents', label: AGENTS.map((agent) => agent.name).join(', ') }

function ScaleStrip() {
  return (
    <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      {[...SCALE, AGENT_STAT].map((stat) => (
        <li key={stat.label} className="bg-bg p-6">
          <Figure value={stat.value} unit={stat.unit} />
          <p className="mt-3 text-[14px] leading-[1.5] text-muted">{stat.label}</p>
        </li>
      ))}
    </ul>
  )
}

/** The home page's measured numbers, each with how it was measured. */
export function Measured() {
  return (
    <section id="measured" className="scroll-mt-16 border-t border-line py-24">
      <div className="mx-auto max-w-[1160px] px-4 sm:px-8">
        <Eyebrow index="05">Measured</Eyebrow>
        <SectionTitle lead="Continuum runs on every session start and every edit, so it has to stay out of the way. These numbers are measured, not estimated.">
          Fast enough to forget it’s there.
        </SectionTitle>
        <div className="grid gap-4">
          <LatencyList />
          <LatencyTable />
          <ScaleStrip />
        </div>
        <p className="mt-6 max-w-[820px] text-[13px] leading-[1.6] text-subtle">
          Measured on {MEASURED.machine} on {MEASURED.date}, in a repository with {MEASURED.repository}. End to end is what the agent waits for: a new
          process started the way Claude Code starts a hook, running the bundle the plugin installs. In process is the same briefing built inside one
          process. The working-tree read is the best of three runs.
        </p>
      </div>
    </section>
  )
}
