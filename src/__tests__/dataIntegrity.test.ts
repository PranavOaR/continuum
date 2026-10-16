import { describe, expect, it } from 'vitest'
import { MOCK_ACTIVITY } from '../data/mockActivity'
import { MOCK_FILES } from '../data/mockFiles'
import { SEED_HANDOFFS } from '../data/mockHandoffs'
import { MOCK_MEMORY } from '../data/mockMemory'
import { MOCK_PROJECTS } from '../data/mockProjects'
import { MOCK_SESSIONS } from '../data/mockSessions'
import { MOCK_TASKS } from '../data/mockTasks'
import { MOCK_VERIFICATION } from '../data/mockVerification'

const ids = <T extends { id: string }>(items: readonly T[]) => new Set(items.map((item) => item.id))
const projectIds = ids(MOCK_PROJECTS)
const taskIds = ids(MOCK_TASKS)
const fileIds = ids(MOCK_FILES)
const memoryIds = ids(MOCK_MEMORY)
const handoffIds = ids(SEED_HANDOFFS)

describe('mock dataset integrity', () => {
  it('uses unique ids within every collection', () => {
    const collections: ReadonlyArray<readonly { id: string }[]> = [MOCK_PROJECTS, MOCK_TASKS, MOCK_FILES, MOCK_MEMORY, MOCK_VERIFICATION, MOCK_ACTIVITY, MOCK_SESSIONS, SEED_HANDOFFS]
    for (const collection of collections) {
      expect(ids(collection).size).toBe(collection.length)
    }
  })

  it('points every project current task at an unfinished task in the same project', () => {
    for (const project of MOCK_PROJECTS.filter((p) => p.currentTaskId)) {
      const task = MOCK_TASKS.find((t) => t.id === project.currentTaskId)
      expect(task?.projectId).toBe(project.id)
      expect(task?.status).not.toBe('completed')
    }
  })

  it('links tasks only to files and checks within the same project', () => {
    for (const task of MOCK_TASKS) {
      expect(projectIds.has(task.projectId)).toBe(true)
      for (const fileId of task.relatedFileIds) {
        expect(MOCK_FILES.find((f) => f.id === fileId)?.projectId).toBe(task.projectId)
      }
      for (const verificationId of task.verificationIds) {
        expect(MOCK_VERIFICATION.find((v) => v.id === verificationId)?.projectId).toBe(task.projectId)
      }
    }
  })

  it('keeps file, memory, activity, session and handoff references valid', () => {
    for (const file of MOCK_FILES) {
      if (file.taskId) expect(taskIds.has(file.taskId)).toBe(true)
      file.decisionIds.forEach((id) => expect(memoryIds.has(id)).toBe(true))
    }
    for (const record of MOCK_MEMORY) {
      if (record.taskId) expect(taskIds.has(record.taskId)).toBe(true)
      record.relatedFileIds.forEach((id) => expect(fileIds.has(id)).toBe(true))
    }
    for (const event of MOCK_ACTIVITY) {
      expect(projectIds.has(event.projectId)).toBe(true)
      if (event.taskId) expect(taskIds.has(event.taskId)).toBe(true)
      if (event.fileId) expect(fileIds.has(event.fileId)).toBe(true)
      if (event.handoffId) expect(handoffIds.has(event.handoffId)).toBe(true)
    }
    for (const session of MOCK_SESSIONS) {
      if (session.taskId) expect(taskIds.has(session.taskId)).toBe(true)
    }
    for (const handoff of SEED_HANDOFFS) {
      expect(MOCK_TASKS.find((t) => t.id === handoff.taskId)?.projectId).toBe(handoff.projectId)
      expect(handoff.sourceAgent).not.toBe(handoff.targetAgent)
    }
    for (const record of MOCK_VERIFICATION) {
      if (record.taskId) expect(taskIds.has(record.taskId)).toBe(true)
    }
  })

  it('never records a passing check without a recorded run', () => {
    for (const record of MOCK_VERIFICATION.filter((v) => v.status === 'passed')) {
      expect(record.lastRunAt).toBeDefined()
      expect(record.lastRunRevision).toBeDefined()
      expect(record.evidenceType).toBe('verified')
    }
  })

  it('never marks the "tests pass" criterion complete while its checks are unverified', () => {
    const task = MOCK_TASKS.find((t) => t.id === 'task-google-auth')
    const criterion = task?.acceptanceCriteria.find((c) => c.text.startsWith('Authentication tests pass'))
    expect(criterion?.status).not.toBe('complete')
  })

  it('orders each session start before its end', () => {
    for (const session of MOCK_SESSIONS) {
      expect(Date.parse(session.startedAt)).toBeLessThan(Date.parse(session.endedAt))
    }
  })
})
