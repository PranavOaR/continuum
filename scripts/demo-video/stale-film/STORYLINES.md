# Stale-test film: three storylines

The one thing: when a file changes after a test passed, Continuum tells the next agent the pass no longer counts,
before it trusts it. Remember: "the green tick goes amber when the code moves under it."
The spine: one passing `npm test` on `src/tax.ts`, carried from Friday's Claude Code session to Monday's Codex session.
Facts used: `continuum run -- npm test` records a verified pass; a later change to a covered file marks the check
OUT OF DATE in the handoff ("re-run checks marked OUT OF DATE"); task replay shows "unit went out of date: It passed
against src/tax.ts, which has changed since."

## A. Friday's green tick (recommended: a situation every developer has lived)

- Device / form: a moment in someone's day, one continuous take along a timeline that runs left to right.
- What the viewer sees: Friday 6:40 pm, Claude Code finishes, `continuum run -- npm test` and a Verified badge.
  A quick hand edit to `src/tax.ts` "just one line" before logging off. Monday, Codex opens; its briefing shows
  the same check in amber, OUT OF DATE. Codex re-runs it, it fails, and it fixes the line before anything ships.
  The camera pulls back onto the task replay, where the amber step sits exactly between the pass and the edit.
- First two seconds: a Verified badge, big and green, over "Friday 6:40 pm"; a cursor already typing into `src/tax.ts`.
- Beats: green tick → hand edit → weekend passes (clock spins) → Codex briefing, badge turns amber → re-run fails →
  fix, verified again → pull back to the replay, amber step lit → claim → end card.
- Look: the brand paper ground and dot grid, dark terminals, green #12804c for verified, amber for out of date,
  violet accent only on the replay's thread.
- Sound: the existing 104 BPM bed, soft keys on typing, a low "tick" when the badge turns amber.

## B. The badge that holds

- Device / form: type carries the argument; match cuts, the badge holds centre frame while everything changes.
- What the viewer sees: one badge stays dead centre for the whole film. Around it the file, the agent and the day
  change on hard cuts; the badge flips from green to amber the instant the file's hash changes, and back to green
  only when a real run passes.
- First two seconds: "Tests pass." in giant type, the badge stamping onto the full stop.
- Beats: "Tests pass." → "Then src/tax.ts changed." → badge amber → "Your next agent sees that." → re-run → green →
  replay strip slides under the badge → end card.
- Look: flat colour fields cutting on the beat (paper, ink, amber), Geist display at 160 px.
- Sound: a tighter bed cut on the beat, a stamp sound per badge change.

## C. Scrubbing back (the bold one)

- Device / form: the result first; one frame that rebuilds, the replay scrubbed backwards.
- What the viewer sees: it opens on a failing deploy, then the task replay scrubs backwards step by step, each step
  rewinding its scene, until it stops on the one amber row: the check that went out of date on Friday. Then it
  plays forward with Continuum flagging it, and the deploy goes green.
- First two seconds: a red "deploy failed" line, then a playhead grabs it and drags left.
- Beats: failure → rewind through steps → stop on amber row → "Continuum would have told you" → forward play with the
  flag → green → end card.
- Look: the replay page itself rebuilt at 1.8x as the whole world, tape-rewind blur on the scrub.
- Sound: reverse whoosh on the scrub, a bed that drops in on forward play.

## Assumptions

About 45–60 s, 1920x1080, 30 fps. Music and sound from the existing bed and SFX (free). No narration: on-screen
lines carry it, so no ElevenLabs cost; a voiceover in the first film's voice is the paid option.
