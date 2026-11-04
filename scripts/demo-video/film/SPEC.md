# SPEC: Continuum demo, "The thread"

```text
GOAL:    a developer who switches agents thinks "the next one would already know where I stopped", and copies the setup command.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps
TIME:    73.91 s x 30 = 2217 frames. Voice is the clock (assets/audio/voice-timing.json; cue times in .work/cues.json).
         Voice: ElevenLabs eleven_v4, "Mark - Natural Conversations" (a professional voice clone from the Voice
         Library), one take of a script written to be spoken (voiceover.txt): contractions, "So" and "Now
         normally" openers, two light fillers ("um", "you know"), one [sighs], CAPS on the stressed words (ZERO,
         EXACTLY), questions where the pitch rises. 171 wpm, 15.3 st of pitch movement. Normalised to -19 LUFS.
         Bed 104 BPM (17.3 frames a beat), used as texture, not as a cut grid; lengthened by two-bar repeats at 35.3 s
         and 52.1 s, starting under the intro.
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
TRANSITIONS: two families, on the real scenes (no canvas re-paint), each scene pair overlapping its hosts by the move.
         Remotion's presentations: clockWipe (conic mask, power2.inOut 0.75 s), slide (both scenes push 1920 px,
         power3.inOut 0.7 s, 28 px horizontal blur at mid-move), flip (rotateY 0 -> -90 power2.in 0.26 s, then
         90 -> 0 power3.out 0.42 s, perspective 3200 px), iris (circle clip from the click).
         Runway-style: liquid morph (fractalNoise seed 7, baseFrequency 0.0045 0.007, displacement 0 -> 190 out and
         190 -> 0 in, 0.9 s, the incoming scene fading in over it); light leak (registry organic-light-leak-overlay,
         recoloured white and violet, screen blend, 1.4 s).
SHOTS:   (film time)
  0.0-3.4   intro on paper: the mark opens up (start ring 0.25, thread draws 0.3-1.0, middle dot 0.6, accent dot lands
            0.95 on the logo hit), "continuum" types in letter by letter behind a violet caret (1.2-1.76), the caret
            blinks and goes; 2.6 the camera pushes into the start ring and it irises open onto the first terminal.
  2.6-10.2  Claude terminal 1500x780, reply streaming; prompt back at 6.82 (stopped); "npm test still fails"
            underlined danger at 8.26 (left). 9.25 window collapses (power3.in 0.45 s, blur) into the start ring.
  10.2-19.4 Codex window grows out of a dot at (1590, 600) (expo.out 0.6 s) as "you'd open another agent" is said.
            You type a re-explanation, faster and faster (11.42-15.79); select-all at 16.74 (everything), delete at
            18.82 (again). 18.98 window collapses into the accent end dot. Bed near-silent.
  19.4-23.9 the thread draws 330 -> 1590 through the handoff dot (19.45-20.26), the middle dot lands at 19.93, the
            thread shrinks into the mark and "continuum" wipes in at 20.38 (Continuum). 23.2 clock wipe around the
            handoff dot into the setup terminal.
  23.2-29.4 setup terminal: both real setup commands typed (24.23 on "connect"), real output; 28.71 slide left into
            Claude at work.
  28.7-44.3 Claude terminal recedes; the task card rises out of it: title at 31.92 (task), done step at 32.88,
            next action at 34.64. 35.76 the card is carried right (scale 1 -> 0.62, blur 6 px) into Codex's window,
            where it becomes the real briefing; rows light at done 39.67, left 40.47, punch-in on Next action 41.27.
            43.36 liquid morph: the briefing melts into Codex at work.
  43.4-55.3 Codex's real reply and the addTax diff (fix at 46.12); 48.27 flip to the verify terminal (lands on "run");
            real `continuum run -- npm test`; the Verified badge springs at 51.68; its real line at 53.02;
            54.61 zoom through the badge.
  55.3-63.2 the real dashboard, pulled back from its Verified badge; task header at 58.14 (one task); camera glides
            to Agent activity, Claude rows then Codex rows light (59.1 carried, 60.7 next); cursor clicks Codex.
  62.7-66.1 iris flood from the cursor; "Your work continues." / "Your agents change." per word on the voice.
  66.1-73.9 light leak: the violet overexposes into paper; the mark performed (thread draws, three dots land, impact
            on the accent dot), wordmark wipes at 67.33, CTA `npx getcontinuum setup claude-code` and
            "Free · runs on your machine · continuumgroup.dev"; hold 3 s.
BANNED:  dark void with small floating things; glow, bloom, particles, gradients, glass (the light leak is the one
         gradient, on the one seam where the flood becomes paper); serif display, italic accents,
         numbered labels, decorative pills or corner labels; everything centred or fading up the same way; three cards
         in a row; a title over a dimmed screenshot; the logo docked in a corner; text moving while read; invented UI
         (every terminal line and dashboard pixel is from the real run, apart from the typed re-explanation, which is
         you typing, and the repo path shown as ~/code/pricing).
QA:      1.0 (the mark landing); 2.2 (lockup typed, caret gone); 2.95 (the ring opening onto the terminal);
         6.5 (a real agent run); 14.5 (typing pile-up readable); 20.6 (mark + wordmark);
         27.5 (both setups readable >= 26 px); 35.0 (task card with next action); 41.8 (Next action punch-in);
         52.0 (Verified badge); 58.4 (dashboard task header readable); 61.4 (Codex rows lit);
         65.0 (claim); 71.5 (end card, CTA readable). Transitions mid-move: 2.95, 23.55, 29.05, 43.8, 48.42, 66.55.
```
