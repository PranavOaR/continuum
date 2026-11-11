# SPEC: Continuum stale-test film, "Friday's green tick" (STORYLINES.md, A)

```text
GOAL:    a developer who hands work between agents thinks "my next agent won't trust a pass the code has moved past",
         and copies the setup command.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, 53.5 s = 1605 frames. No narration: the on-screen headline carries it.
SOURCE:  every terminal line, check wording, briefing line and replay step comes from assets/capture.json, written by
         capture.mjs from this checkout's real CLI and MCP server. Two edits, both labelled here: the capture ran in
         seconds, so "Ran just now" reads "Ran 2d ago" (the briefing's own format) and the replay's clock times are
         illustrative Friday-evening and Monday-morning times. Day labels follow the page's grouping.
LOOK:    the first film's system (../film/SPEC.md): paper #fafaf7 with the dot grid, ink #141318, muted #5c5a62,
         line #e4e2dc; terminals #15141b; cards white. Display Geist 500 84 px headline, mono Geist Mono 28 px.
         success #12804c (passed, verified), warning #a35f00 / terminal #e4a947 (out of date), danger #cc2f2f (failed).
         Accent #5b45ff ONLY on the replay's thread, the claim flood and the end card dot.
MOTION:  enter expo.out 0.5-0.6 s, exits power3.in 0.3 s, camera power2.inOut 0.7-0.9 s; badges flip on rotationX
         (power2.in 0.18 s out, back.out(1.6) 0.32 s in); headline words blur in 6 px -> 0, 0.06 s apart.
SOUND:   the first film's bed at 0.16-0.3, soft keys on typing, a pop on every badge change, swishes on camera moves.
SHOTS:   (film time)
  0.0-8.6   friday: "FRIDAY · 6:40 PM"; "The tests pass." beside the unit check card (passed, verified, Claude Code).
            2.4 the card moves aside and src/tax.js opens; "Just one more line." 3.8 `round` selected, 4.3 `trunc` typed;
            5.8 "Nobody re-runs the tests." 7.6 everything slides left out of frame.
  8.0-12.4  weekend: the day strip Fri Sat Sun Mon, a playhead runs across, lands on "MONDAY · 9:12 AM".
  12.0-34.8 monday: Codex's terminal shows the real briefing lines; 15.2 the OUT OF DATE line lights amber and the card
            flips passed -> out of date ("1 file changed since it ran"); "The pass no longer counts." 19.8 Codex takes
            the task up (its real update_task reply), re-runs: the real assertion 1082 !== 1083 and "recorded unit ·
            failed"; card flips to failed; "It re-runs. It fails." 26.6 the real diff trunc -> round, the run again,
            "recorded unit · passed"; card flips to passed + verified; "Fixed, and verified again."
  34.2-45.6 replay: the dashboard's replay page rebuilt at video size, the real step titles under Fri and Mon, the
            violet thread runs down the rows; 39.6 punch-in on "unit went out of date" between the pass and the edit.
  45.4-53.5 close: violet flood, "The tick goes amber" / "when the code moves under it."; the mark, "continuum", the
            setup command, "Free · Runs on your machine · continuumgroup.dev".
```
