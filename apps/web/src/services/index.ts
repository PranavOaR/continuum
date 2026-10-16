import type { ContinuumService } from '@continuum/core'
import { mockContinuumService } from './mockContinuumService'

/** Swap this binding for a real implementation when a backend exists. */
export const continuumService: ContinuumService = mockContinuumService

export { NotFoundError } from '@continuum/core'
export type {
  AttentionItem,
  AttentionKind,
  ContinuumService,
  OverviewData,
  ProjectSummary,
  ProjectWorkspace,
  SearchResult,
  SearchResultKind,
} from '@continuum/core'
