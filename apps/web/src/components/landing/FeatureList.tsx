import type { ComponentType } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { HandoffTransferArt, LocalSwarmArt, RetrievalGraphArt } from './featureArt/motionArt'
import { ChangeScanArt, EvidenceOrbitsArt, MemoryLayersArt } from './featureArt/structureArt'

interface Feature {
  title: string
  body: string
  Art: ComponentType<{ isAnimated: boolean }>
}

const FEATURES: readonly Feature[] = [
  {
    title: 'Memory that keeps up with the project.',
    body: 'Decisions, known issues and previous attempts are stored as typed records, layered onto the tasks and files they affect, so nothing important lives only in a chat log.',
    Art: MemoryLayersArt,
  },
  {
    title: 'Every change, accounted for.',
    body: 'Continuum records which files each session touched, what changed, and why it matters to the task, so the next agent starts from the diff, not from a guess.',
    Art: ChangeScanArt,
  },
  {
    title: 'State you can trust.',
    body: 'Each claim carries its evidence: observed, verified by a recorded check, reported by an agent, or inferred. Tests are never marked passing without a recorded run.',
    Art: EvidenceOrbitsArt,
  },
  {
    title: 'Any agent, one handoff.',
    body: 'Choose what to include and get a focused context package for Claude Code, Codex, Cursor or ChatGPT. Your context moves with you, not with a provider.',
    Art: HandoffTransferArt,
  },
  {
    title: 'Retrieval that follows the code.',
    body: 'Context is assembled by walking from the task to the files, symbols, decisions and checks it touches, rather than by searching a transcript.',
    Art: RetrievalGraphArt,
  },
  {
    title: 'Local-first by design.',
    body: 'Indexing and retrieval are designed to run on your machine, without mandatory external AI APIs. Your project stays inside the boundary you set.',
    Art: LocalSwarmArt,
  },
]

export function FeatureList() {
  const isAnimated = !useReducedMotion()
  return (
    <div>
      <ul className="grid gap-x-14 gap-y-12 md:grid-cols-2">
        {FEATURES.map(({ title, body, Art }) => (
          <li key={title} className="flex gap-5">
            <Art isAnimated={isAnimated} />
            <div className="min-w-0 pt-0.5">
              <h3 className="text-[17px] font-medium tracking-[-0.015em] text-fg">{title}</h3>
              <p className="mt-1.5 text-[15px] leading-[1.6] text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
