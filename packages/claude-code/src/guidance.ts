/**
 * Codex, Cursor and Copilot report no exit codes to Continuum, so their own test
 * runs are not evidence of anything. Run through `continuum run`, the same
 * command is recorded as verified, tied to the exact files it ran against.
 * Said in their briefing (Codex) and in the instruction files setup writes.
 */
export const VERIFIED_RUN_HINT =
  'Your own test, lint and build runs are not recorded here. Run them through Continuum, e.g. `npx getcontinuum run --name tests -- npm test`, so the next agent sees a verified result tied to the code it ran against.'
