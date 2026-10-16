export type TaskStatus = 'planned' | 'in-progress' | 'blocked' | 'completed'

export type CriterionStatus = 'complete' | 'incomplete' | 'unknown'

export interface AcceptanceCriterion {
  id: string
  text: string
  status: CriterionStatus
  /** Short note on where the status comes from. */
  evidence: string
}

export interface ProjectTask {
  id: string
  projectId: string
  title: string
  description: string
  objective: string
  status: TaskStatus
  acceptanceCriteria: AcceptanceCriterion[]
  completedSteps: string[]
  remainingSteps: string[]
  nextAction?: string
  relatedFileIds: string[]
  verificationIds: string[]
  updatedAt: string
}
