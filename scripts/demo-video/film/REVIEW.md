# Review: "The thread", first cut (2026-10-22)

## Creative calls

- Storyline A, "The thread" (`STORYLINES.md`): Continuum's own logo, three dots on one thread, is the handoff made visible. Not built: B "The result first" (shows the payoff before the problem) and C "Split screen to one" (side-by-side panels are a tell).
- Everything on screen is from a real run: the terminals quote `capture.json`, and the dashboard is a 2x screenshot of `continuum serve` on that run. The exceptions are the re-explanation typed into a blank Codex session, which stands for doing it by hand, and the path shown as `~/code/pricing`. The rebuilt task card and check card copy the dashboard's wording.
- Voice: ElevenLabs `eleven_v3`, voice "Chris", one continuous take cut at its breaths, so the intonation runs across the film instead of being stitched per line. Picked against Eric and Jessica: the most natural pace (155 wpm) and the most pitch movement of the three, and 0.8% word error on a transcription check (one miss: "tests" heard as "test").
- Music: a 104 BPM loop generated with ElevenLabs' sound model (the account cannot use its music API), almost silent while you re-explain, opening at the reveal, swelling into the dashboard, the claim and the end card.

## Measured, and only looked at

- Measured: `check` passes; loudness of the draft -17.5 LUFS with -1.5 dBTP and no clipping (publish.mjs normalises to -16 LUFS); voice pace and pitch variation; transcription accuracy; effect peaks placed a frame after their pictures.
- Looked at: the review sheets (beats, five seams, phone width) and spot frames at every cue.
- **Nobody has listened to it.** The voice, the bed and the mix were chosen and checked by measurement only.

## Weakest shot, and what I would change

- 34.0-36.9 s: Codex's window holds only the struck diff line for about 3 s before the fix types in. With more time: open it on Codex's own edit summary, or bring the fix in on "picks up the same task".
- On a phone, terminal text sits at the 28 px floor: legible, small. A tighter crop on the briefing and the diff would help there.

## Warnings kept on purpose

- `line_unread` on Claude Code's reply in `carry`: the viewer read the same reply in the opening; here it is recognised, not read.
- `line_unread` on Codex's setup output (1.7 s): the voice says what it means ("One command each").
- `text_below_floor` on chips: measured while they spring in from 55% scale; at rest they are 24-26 px labels beside 30-56 px text.
