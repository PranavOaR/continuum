import type { AgentType, ProjectWorkspace } from '@continuum/core'
import { describe, expect, it } from 'vitest'
import { gettingStartedSteps } from '../components/projects/gettingStartedSteps'

const workspace = (connectedAgents: AgentType[], fields: Partial<ProjectWorkspace> = {}) =>
  ({ tasks: [], sessions: [], verification: [], setup: { connectedAgents }, ...fields }) as unknown as ProjectWorkspace

const step = (steps: ReturnType<typeof gettingStartedSteps>, id: string) => {
  const found = steps.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`no step ${id}`)
  return found
}

describe('gettingStartedSteps', () => {
  it('asks you to connect an agent, naming every agent, when none is connected', () => {
    const connect = step(gettingStartedSteps(workspace([])), 'connect')
    expect(connect.done).toBe(false)
    expect(connect.title).toBe('Connect an agent')
    expect(connect.hint).toContain('codex, cursor or vscode')
    expect(connect.command).toBe('continuum setup claude-code')
  })

  it.each<AgentType>(['claude-code', 'codex', 'cursor', 'vscode'])('ticks off connecting for %s', (agent) => {
    expect(step(gettingStartedSteps(workspace([agent])), 'connect').done).toBe(true)
  })

  it('names the connected agent, not Claude Code, in the next step', () => {
    const session = step(gettingStartedSteps(workspace(['codex'])), 'session')
    expect(session.title).toBe('Work in a Codex session')
    expect(session.hint).toContain('/hooks')
    expect(session.hint).not.toContain('Claude')
  })

  it('tells Cursor users to open a session, since Cursor has no hooks', () => {
    const session = step(gettingStartedSteps(workspace(['cursor'])), 'session')
    expect(session.command).toBe('continuum session start --agent cursor')
    expect(session.hint).not.toContain('recorded as you work')
  })

  it('stays general until an agent is connected', () => {
    const steps = gettingStartedSteps(workspace([]))
    expect(step(steps, 'session').title).toBe('Work in an agent session')
    for (const { title, hint } of steps) expect(`${title} ${hint}`).not.toContain('Claude')
  })

  it('claims automatic check capture only where it happens', () => {
    expect(step(gettingStartedSteps(workspace(['claude-code'])), 'check').hint).toContain('recorded automatically')
    for (const agent of ['codex', 'cursor', 'vscode'] as const) {
      expect(step(gettingStartedSteps(workspace([agent])), 'check').hint).not.toContain('automatically')
    }
  })

  it('never names Claude in the task step', () => {
    expect(step(gettingStartedSteps(workspace(['codex'])), 'task').hint).toContain('your agent')
  })

  it('ticks off steps from what was recorded', () => {
    const steps = gettingStartedSteps(workspace(['codex'], { sessions: [{}], tasks: [{}], verification: [{}] } as unknown as Partial<ProjectWorkspace>))
    expect(steps.every((candidate) => candidate.done)).toBe(true)
  })
})
