import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '../services'
import { isRecentlyActive, recentProjects } from '../utils/projectActivity'

const NOW = Date.parse('2026-11-02T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString()

function summary(id: string, status: ProjectSummary['status'], updatedAt: string): ProjectSummary {
  return {
    project: { id, name: id, description: '', repositoryName: id, branch: 'main', stack: [], lastActiveAgent: 'claude-code', updatedAt },
    status,
    progress: { done: 0, total: 0 },
    changedFileCount: 0,
  }
}

describe('isRecentlyActive', () => {
  it('counts a project with an open task, however long ago it changed', () => {
    expect(isRecentlyActive(summary('a', 'in-progress', daysAgo(30)), NOW)).toBe(true)
    expect(isRecentlyActive(summary('b', 'blocked', daysAgo(30)), NOW)).toBe(true)
  })

  it('counts a project without a task that was worked on in the last seven days', () => {
    expect(isRecentlyActive(summary('c', 'idle', daysAgo(0.01)), NOW)).toBe(true)
    expect(isRecentlyActive(summary('d', 'completed', daysAgo(6.9)), NOW)).toBe(true)
  })

  it('leaves out a project untouched for more than seven days', () => {
    expect(isRecentlyActive(summary('e', 'idle', daysAgo(7.1)), NOW)).toBe(false)
  })
})

describe('recentProjects', () => {
  it('keeps the recently active projects, most recently worked on first', () => {
    const projects = [summary('old', 'idle', daysAgo(20)), summary('task', 'in-progress', daysAgo(3)), summary('today', 'idle', daysAgo(0.1))]
    expect(recentProjects(projects, NOW).map((entry) => entry.project.id)).toEqual(['today', 'task'])
  })
})
