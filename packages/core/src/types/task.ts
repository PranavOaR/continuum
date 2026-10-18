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
  /** Parts of the task you changed in the dashboard since an agent last reported it; everything else is the agent's. */
  userEdited?: TaskField[]
}

/** The parts of a task a dashboard edit can change. */
export type TaskField = 'status' | 'nextAction' | 'steps' | 'criteria'

/** One edit made to a task in the dashboard. */
export type TaskChange =
  | { kind: 'status'; status: TaskStatus }
  | { kind: 'next-action'; nextAction: string | null }
  | { kind: 'step'; step: string; done: boolean }
  /** `text` must match the criterion at `index`, so a list reordered meanwhile cannot tick the wrong one. */
  | { kind: 'criterion'; index: number; text: string; met: boolean }
