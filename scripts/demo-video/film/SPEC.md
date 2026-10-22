# SPEC: Continuum demo, "The thread"

```text
GOAL:    a developer who switches agents thinks "the next one would already know where I stopped", and copies the setup command.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps
TIME:    64.5 s x 30 = 1935 frames. Voice is the clock (assets/audio/voice-timing.json; cue times in .work/cues.json).
         Bed 104 BPM (17.3 frames a beat), used as texture, not as a cut grid.
LOOK:    ground #fafaf7 (brand --bg) with the brand dot grid: 2 px dots rgb(20 19 24 / 0.10) every 32 px,
         faded to 0 over the outer 30% by a radial mask; no grain, no vignette.
         ink #141318, muted #5c5a62, line #e4e2dc; accent #5b45ff ONLY on: the thread and its end dot,
         the "Next action" row, the claim's colour flood, the end card's dot.
         success #12804c (verified only), danger #cc2f2f (one failing line only).
         display Geist 500, 112 px (10.4% of H), tracking -0.04em; quiet lines Geist 400 44 px muted.
         mono Geist Mono 400 29 px / 1.55 inside terminals (>= 26 px floor).
         medium: product surfaces. Terminals are the brand's dark surface #15141b, title bar #1c1b23,
         text #f4f2ee, dim #aeaab6, radius 22 px, shadow 0 40px 90px -30px rgb(20 19 24 / .45) + 0 2px 6px rgb(20 19 24 / .08).
         Cards are white #ffffff, 1.5 px #e4e2dc border, radius 20 px, the same shadow at 60%.
OBJECTS: Claude Code and Codex terminals with their real logos in the title bar; the task card (the dashboard's own
         task panel rebuilt at 1.8x: title, evidence label, steps with checks, next action); the real dashboard
         screenshot (2x capture); the Continuum mark (the logo's thread: ring dot, ink dot, accent dot).
MOTION:  enter expo.out / power4.out 0.5-0.7 s; camera power2.inOut 0.6-0.9 s; exits power3.in, 40-50% shorter;
         fast moves carry a directional SVG blur peaking at mid-move (8-16 px); springs only on badges
         (back.out(1.6) = damping ~0.6), never on text or opacity. Words blur in 6 px -> 0 in 0.13 s, 0.07 s apart.
         Landed titles are dead still. Stagger rows 60 ms.
SHOTS:   (film time)
  0.0-5.4   Claude terminal 1500x780, reply streaming; "npm test still fails" underlined danger at 3.3 (stopped).
            5.0 window collapses (power3.in 0.45 s, blur) into the thread's start ring at (330, 600).
  5.4-11.5  Codex window grows out of a dot at (1590, 600) (expo.out 0.6 s). You type a re-explanation, faster
            and faster (6.3-9.6); select-all at 10.2 (everything), delete at 10.9 (again). 11.05 window collapses
            into the accent end dot. Bed near-silent.
  11.5-16.2 the thread draws 330 -> 1590 through the handoff dot (11.55-12.6, power2.inOut), the middle dot lands
            at 12.6, the whole thread shrinks into the mark and "continuum" wipes in at 12.92 (Continuum).
            15.55 zoom through the middle dot (power3.in 0.6 s) into the next terminal.
  16.2-20.6 setup terminal: both real setup commands typed, real output; 20.2 whip left.
  20.6-34.0 Claude terminal recedes; the task card rises out of it: title at 22.94 (task), done step at 23.96,
            next action at 25.19. 26.0 the card is carried right (scale 1 -> 0.62, blur 6 px) into Codex's window,
            where it becomes the real briefing; rows light at done 29.98, left 30.95, punch-in on Next action 31.82.
  34.0-46.4 punch cut: Codex's real reply and the addTax diff (fix at 36.99); 38.9 blur swap to the verify terminal;
            real `continuum run -- npm test`; the Verified badge springs at 42.57; its real line at 44.02;
            45.8 zoom through the badge.
  46.4-53.6 the real dashboard, pulled back from its Verified badge; task header at 48.92 (one task); camera glides
            to Agent activity, Claude rows then Codex rows light (49.96 carried, 51.54 next); cursor clicks Codex.
  53.6-57.6 iris flood from the cursor; "Your work continues." / "Your agents change." per word on the voice.
  57.6-64.5 paper; the mark performed (thread draws, three dots land, impact on the accent dot), wordmark wipes,
            CTA `npx getcontinuum setup claude-code` and "Free · runs on your machine · continuumgroup.dev"; hold 3 s.
BANNED:  dark void with small floating things; glow, bloom, particles, gradients, glass; serif display, italic accents,
         numbered labels, decorative pills or corner labels; everything centred or fading up the same way; three cards
         in a row; a title over a dimmed screenshot; the logo docked in a corner; text moving while read; invented UI
         (every terminal line and dashboard pixel is from the real run, apart from the typed re-explanation, which is
         you typing, and the repo path shown as ~/code/pricing).
QA:      2.0 (frame 0 reads: a real agent run, not a logo); 8.0 (typing pile-up readable); 12.95 (mark + wordmark);
         18.5 (both setups readable >= 26 px); 25.5 (task card with next action); 32.2 (Next action punch-in);
         42.8 (Verified badge); 49.2 (dashboard task header readable); 51.8 (Codex rows lit);
         55.5 (claim); 63.0 (end card, CTA readable).
```
