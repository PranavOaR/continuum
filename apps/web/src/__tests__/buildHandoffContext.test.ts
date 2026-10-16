import { describe, expect, it } from 'vitest'
import { mockContinuumService } from '../services/mockContinuumService'
import { buildHandoffContext } from '@continuum/core'

const workspace = await mockContinuumService.getWorkspace('startup-app')

describe('buildHandoffContext', () => {
  it('includes only the selected categories, in a stable order', () => {
    // Arrange
    const input = { workspace, taskId: 'task-google-auth', sourceAgent: 'claude-code', targetAgent: 'codex', includedContext: ['next-steps', 'current-task'] } as const

    // Act
    const context = buildHandoffContext(input)

    // Assert
    expect(context.sections.map((s) => s.category)).toEqual(['current-task', 'next-steps'])
    expect(context.text).toContain('From: Claude Code → To: Codex')
    expect(context.text).not.toContain('## File changes')
  })

  it('lists the task files and verification states', () => {
    const context = buildHandoffContext({
      workspace,
      taskId: 'task-google-auth',
      sourceAgent: 'claude-code',
      targetAgent: 'cursor',
      includedContext: ['file-changes', 'verification'],
    })
    expect(context.text).toContain('src/auth/google-callback.ts (added)')
    expect(context.text).toContain('Authentication test suite — Out of date.')
    expect(context.text).toContain('Type check — Passed.')
  })

  it('labels the output as generated from mock data', () => {
    const context = buildHandoffContext({ workspace, taskId: 'task-google-auth', sourceAgent: 'codex', targetAgent: 'chatgpt', includedContext: ['current-task'] })
    expect(context.text).toContain('mock data')
  })

  it('estimates tokens as characters divided by four', () => {
    const context = buildHandoffContext({ workspace, taskId: 'task-google-auth', sourceAgent: 'codex', targetAgent: 'chatgpt', includedContext: ['current-task'] })
    expect(context.estimatedTokens).toBe(Math.ceil(context.text.length / 4))
  })

  it('returns no sections when nothing is selected', () => {
    const context = buildHandoffContext({ workspace, taskId: 'task-google-auth', sourceAgent: 'codex', targetAgent: 'chatgpt', includedContext: [] })
    expect(context.sections).toHaveLength(0)
  })

  it('marks empty categories as none recorded', () => {
    const context = buildHandoffContext({ workspace, taskId: 'task-dashboard-filters', sourceAgent: 'codex', targetAgent: 'chatgpt', includedContext: ['file-changes'] })
    expect(context.text).toContain('- None recorded.')
  })

  it('throws when the task is not in the project', () => {
    expect(() =>
      buildHandoffContext({ workspace, taskId: 'task-mdx-blog', sourceAgent: 'codex', targetAgent: 'chatgpt', includedContext: ['current-task'] }),
    ).toThrow(/not part of project/)
  })
})
