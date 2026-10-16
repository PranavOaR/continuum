/**
 * How Continuum knows something. Every record in the UI carries one of these
 * so that observed facts are never confused with agent claims or inferences.
 */
export type EvidenceType = 'observed' | 'verified' | 'agent-reported' | 'inferred' | 'simulated'
