# Review: "Friday's green tick"

Checked against SPEC.md on the delivery render (renders/stale-test-master.mp4, 53.5 s, 1920x1080, 30 fps).

- `hyperframes check`: no errors. Warnings kept: contrast and type size on the replay rows dimmed for the punch-in and on the
  rebuilt dashboard's small labels (badges, evidence tags), the same trade the first film makes; one duplicate-image note
  for the agent logos the replay repeats.
- Frames looked at: 0 (thumbnail: the passed and verified card under "The tests pass."), the hand edit (round -> trunc),
  the weekend strip, the OUT OF DATE line lit with the card amber, the failing run with the card red, the verified run,
  the replay with the stale step centred and readable at the punch-in, the claim, the end card.
- Seams in the render: Friday slides out as the weekend slides in; Monday cross-fades over the weekend; Monday pulls back
  under the replay; the violet flood opens from the centre. No blank or doubled frames.
- Story: every claim traces to capture.json. Two labelled edits, both in SPEC.md: the briefing's "Ran 2d ago" (the capture
  ran in seconds and printed "Ran just now") and the replay's clock times.
- Fixed during review: the card in Friday's corner was too small to read (scale 0.62 -> 0.8); the replay punch-in clipped
  both sides (1.55 -> 1.25); the replay text was below 20 px (raised); two still stretches over 3 s (slow pushes added).
- Sound: bed under everything, effects on the edit, each badge change, each run and each camera move. The website encode is
  normalised to -16 LUFS (the master measures -28.6 LUFS, peaks -7.1 dBTP).
