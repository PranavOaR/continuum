import { mockContinuumService } from './mockContinuumService'
import type { ContinuumService } from './types'

/** Swap this binding for a real implementation when a backend exists. */
export const continuumService: ContinuumService = mockContinuumService

export * from './types'
