import type {
  ActivityType,
  ChangeType,
  CriterionStatus,
  EvidenceType,
  FileStatus,
  MemoryKind,
  MemorySource,
  ProjectStatus,
  VerificationStatus,
} from './types'

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: 'Planned',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  completed: 'Completed',
  idle: 'No task',
}

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  passed: 'Passed',
  failed: 'Failed',
  'not-run': 'Not run',
  unknown: 'Unknown',
  'out-of-date': 'Out of date',
}

export const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  observed: 'Observed',
  verified: 'Verified',
  'agent-reported': 'Agent-reported',
  'user-reported': 'Set by you',
  inferred: 'Inferred',
  simulated: 'Simulated',
}

export const EVIDENCE_DESCRIPTION: Record<EvidenceType, string> = {
  observed: 'Recorded directly from a project change or session event.',
  verified: 'Backed by a recorded check result, such as a test run.',
  'agent-reported': 'Stated by an agent and not independently confirmed.',
  'user-reported': 'You set this in the dashboard. A statement, not a verified result.',
  inferred: 'Derived by Continuum from other records.',
  simulated: 'Created by this demo; no real action took place.',
}

export const CHANGE_LABEL: Record<ChangeType, string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
}

export const FILE_STATUS_LABEL: Record<FileStatus, string> = {
  'needs-verification': 'Needs verification',
  'work-in-progress': 'Work in progress',
  verified: 'Verified',
}

export const CRITERION_LABEL: Record<CriterionStatus, string> = {
  complete: 'Complete',
  incomplete: 'Incomplete',
  unknown: 'Unknown',
}

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  'file-change': 'File change',
  'task-update': 'Task update',
  decision: 'Decision',
  'test-result': 'Test result',
  session: 'Session',
  commit: 'Commit',
}

export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  decision: 'Architecture decision',
  'known-issue': 'Known issue',
  'previous-attempt': 'Previous attempt',
  'next-action': 'Next action',
}

export const MEMORY_SOURCE_LABEL: Record<MemorySource, string> = {
  'architecture-decision': 'Architecture decision',
  'file-change': 'File change',
  'test-result': 'Recorded test result',
  'agent-summary': 'Agent-provided summary',
  'user-note': 'User note',
  derived: 'Derived by Continuum',
}
