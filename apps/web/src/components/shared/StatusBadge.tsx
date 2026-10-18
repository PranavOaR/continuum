import { Bot, CircleCheck, CircleDashed, CircleDot, CircleHelp, CirclePause, CircleX, Clock, Copy, Eye, FileMinus2, FilePen, FilePlus2, FlaskConical, Lightbulb, OctagonPause, PenLine, ShieldCheck, TriangleAlert, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ChangeType, CriterionStatus, EvidenceType, FileStatus, HandoffStatus, ProjectStatus, VerificationStatus } from '@continuum/core'
import {
  CHANGE_LABEL,
  CRITERION_LABEL,
  EVIDENCE_DESCRIPTION,
  EVIDENCE_LABEL,
  FILE_STATUS_LABEL,
  HANDOFF_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  VERIFICATION_LABEL,
} from '@continuum/core'
import { Badge, type Tone } from './Badge'

interface Visual {
  tone: Tone
  icon: ReactNode
  dashed?: boolean
}

const TASK_VISUAL: Record<ProjectStatus, Visual> = {
  planned: { tone: 'muted', icon: <CircleDashed /> },
  'in-progress': { tone: 'accent', icon: <CircleDot /> },
  blocked: { tone: 'warning', icon: <OctagonPause /> },
  completed: { tone: 'success', icon: <CircleCheck /> },
  idle: { tone: 'muted', icon: <CirclePause /> },
}

const VERIFICATION_VISUAL: Record<VerificationStatus, Visual> = {
  passed: { tone: 'success', icon: <CircleCheck /> },
  failed: { tone: 'danger', icon: <CircleX /> },
  'not-run': { tone: 'warning', icon: <CircleDashed /> },
  unknown: { tone: 'muted', icon: <CircleHelp /> },
  'out-of-date': { tone: 'warning', icon: <Clock /> },
}

const EVIDENCE_VISUAL: Record<EvidenceType, Visual> = {
  observed: { tone: 'neutral', icon: <Eye /> },
  verified: { tone: 'success', icon: <ShieldCheck /> },
  'agent-reported': { tone: 'muted', icon: <Bot /> },
  'user-reported': { tone: 'accent', icon: <UserRound /> },
  inferred: { tone: 'muted', icon: <Lightbulb />, dashed: true },
  simulated: { tone: 'muted', icon: <FlaskConical />, dashed: true },
}

const CHANGE_VISUAL: Record<ChangeType, Visual> = {
  added: { tone: 'success', icon: <FilePlus2 /> },
  modified: { tone: 'accent', icon: <FilePen /> },
  deleted: { tone: 'danger', icon: <FileMinus2 /> },
}

const FILE_STATUS_VISUAL: Record<FileStatus, Visual> = {
  'needs-verification': { tone: 'warning', icon: <TriangleAlert /> },
  'work-in-progress': { tone: 'muted', icon: <PenLine /> },
  verified: { tone: 'success', icon: <ShieldCheck /> },
}

const HANDOFF_VISUAL: Record<HandoffStatus, Visual> = {
  draft: { tone: 'muted', icon: <PenLine />, dashed: true },
  prepared: { tone: 'accent', icon: <CircleCheck /> },
  copied: { tone: 'success', icon: <Copy /> },
}

const CRITERION_VISUAL: Record<CriterionStatus, Visual> = {
  complete: { tone: 'success', icon: <CircleCheck /> },
  incomplete: { tone: 'warning', icon: <CircleDashed /> },
  unknown: { tone: 'muted', icon: <CircleHelp /> },
}

function render(visual: Visual, label: string, title?: string) {
  return (
    <Badge tone={visual.tone} icon={visual.icon} dashed={visual.dashed} title={title}>
      {label}
    </Badge>
  )
}

export const TaskStatusBadge = ({ status }: { status: ProjectStatus }) => render(TASK_VISUAL[status], PROJECT_STATUS_LABEL[status])

export const VerificationBadge = ({ status }: { status: VerificationStatus }) =>
  render(VERIFICATION_VISUAL[status], VERIFICATION_LABEL[status])

export const EvidenceBadge = ({ type }: { type: EvidenceType }) =>
  render(EVIDENCE_VISUAL[type], EVIDENCE_LABEL[type], EVIDENCE_DESCRIPTION[type])

export const ChangeTypeBadge = ({ type }: { type: ChangeType }) => render(CHANGE_VISUAL[type], CHANGE_LABEL[type])

export const FileStatusBadge = ({ status }: { status: FileStatus }) => render(FILE_STATUS_VISUAL[status], FILE_STATUS_LABEL[status])

export const HandoffStatusBadge = ({ status }: { status: HandoffStatus }) =>
  render(HANDOFF_VISUAL[status], HANDOFF_STATUS_LABEL[status])

export const CriterionBadge = ({ status }: { status: CriterionStatus }) => render(CRITERION_VISUAL[status], CRITERION_LABEL[status])
