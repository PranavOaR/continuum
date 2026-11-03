# Review: "The thread"

## Third cut (2026-11-03): a voiceover that sounds like a person

- Asked for after review: "extremely AI generated"; a natural tone that flows like a real person, with emphasis and some fillers.
- Model: `eleven_v4`, which ElevenLabs now calls its most emotive model and recommends for Voice Library voices; every earlier take was `eleven_v3` with a premade voice.
- Script (`voiceover.txt`): rewritten to be said rather than read, keeping every word the picture is cut to. Contractions ("you'd", "Claude's", "that's it"), spoken openers ("So,", "Now normally,"), two light fillers ("um", "you know"), one `[sighs]` where you re-explain everything, CAPS on the stressed words (ZERO, EXACTLY), and questions where a speaker's pitch rises ("But with Continuum?", "And over in the dashboard?").
- Voice: "Mark - Natural Conversations", the most used conversational voice in the library (about 17.6 billion characters in the past year). Auditioned against Hope, Jon, Jessa, Mark (casual) and Jessica Anne Bogart on the opening; Mark had the most pitch movement (16.3 st, std 5.11) at a conversational 155 wpm with the least word-stretching. Three full takes; the one kept stretches least (15.3 st, 171 wpm). A transcription of it matches the script word for word (the transcriber drops "um" and spells "Claude Code" "clodco").
- The take is normalised to -19 LUFS, the level the first cut's mix was built on, and plays at full volume. The film grows to 73.91 s; the picture follows the new take through the same warp, now also anchored on "open", "connect", "Codex" and "run", which a reworded line no longer starts with. Transitions are re-tied to their scene hosts, not to the words, so every move keeps its length. The bed has a second two-bar repeat at 52.1 s.
- Sent to ElevenLabs for this pass: about 4,600 characters (six auditions of 314, three full takes of 891). The API key cannot read the account's balance; a probe line of 29 characters cost 12 credits on `eleven_v4`.
- **Nobody has listened to this cut yet.** The voice was chosen by measurement and by its use in the library.

## Second cut (2026-11-03): new transitions, a softer voice

- Voice: "Sarah" (warm, reassuring) replaces "Chris", picked by ear from four takes of the same script (Sarah, Will, River, Lily). She measures the calmest of the four: 11.0 semitones of pitch range against Chris's 16.1, the darkest spectrum (3410 Hz centroid against 3931), at 138 wpm against 155. Her take is 5.2 LU louder, so the clips play at 0.55 to keep the first cut's balance against the bed.
- Retime: her lines run longer (lines 0, 1 and 3 by 1.0-1.5 s), so the film grows from 64.5 s to 70.19 s. Every scene position, effect and bed-automation point moved by one piecewise-linear warp anchored on the 35 cue words and each line's first and last word; motion durations were kept, and the re-typing in `gap` was slowed by the warp's local ratio (1.14) to keep its pile-up. The bed got one extra two-bar phrase at 35.3 s (4.47 s, an 80 ms crossfade) to cover the longer film.
- Transitions: four seams changed, two kept. Clock wipe around the handoff dot (logo to setup), slide (setup to Claude at work), liquid morph (briefing to Codex at work), flip (diff to test run), light leak (claim to end card); the zoom through the Verified badge and the iris from the click stay. Scenes on either side of a cross-scene move overlap their hosts by its length, each on its own paper (`.stage`), so nothing is re-painted on a canvas: the registry's shader blocks could not take real scenes as input.
- Kept on purpose, new: `line_unread` on Codex's reply (1.36 s before the flip; the voice does not read it) and on the "Fix pricing.js bugs" chip during the flip, which measures the window turning edge-on, not a short hold.
- Intro (asked for after review: the film started abruptly on a terminal): 3.4 s on paper, the mark performed as on the end card, "continuum" typed in behind a violet caret, then the start ring, where work begins, irises open onto Claude Code's terminal. Everything after moves 2.6 s later; the bed now starts under the logo.
- The opening sounded synthetic: in the first take "bug..." ran 1.0 s, "There's" 0.81 s and "Open" 0.77 s. Six new takes of the opening ("bug," for "bug...", three at stability 0.5, three at 1.0) were scored on how far words run past their length; the one kept halves the stretching (1.47 s of excess against 3.07 s) and has the rest of the take's pitch movement (11.1 semitones, std 3.04, against 11.2 and 3.42). It is spliced in the silence before line 2, and the film tightened by 1.89 s.
- Kept on purpose, new: `line_unread` on "c o n t i n u u m", which is the check reading the typed letters as nine words.
- **Nobody has listened to this cut either.** The voice was chosen by ear from samples; the mix was set by measurement.

## First cut (2026-10-22)

### Creative calls

- Storyline A, "The thread" (`STORYLINES.md`): Continuum's own logo, three dots on one thread, is the handoff made visible. Not built: B "The result first" (shows the payoff before the problem) and C "Split screen to one" (side-by-side panels are a tell).
- Everything on screen is from a real run: the terminals quote `capture.json`, and the dashboard is a 2x screenshot of `continuum serve` on that run. The exceptions are the re-explanation typed into a blank Codex session, which stands for doing it by hand, and the path shown as `~/code/pricing`. The rebuilt task card and check card copy the dashboard's wording.
- Voice: ElevenLabs `eleven_v3`, voice "Chris", one continuous take cut at its breaths, so the intonation runs across the film instead of being stitched per line. Picked against Eric and Jessica: the most natural pace (155 wpm) and the most pitch movement of the three, and 0.8% word error on a transcription check (one miss: "tests" heard as "test").
- Music: a 104 BPM loop generated with ElevenLabs' sound model (the account cannot use its music API), almost silent while you re-explain, opening at the reveal, swelling into the dashboard, the claim and the end card.

### Measured, and only looked at

- Measured: `check` passes; loudness of the draft -17.5 LUFS with -1.5 dBTP and no clipping (publish.mjs normalises to -16 LUFS); voice pace and pitch variation; transcription accuracy; effect peaks placed a frame after their pictures.
- Looked at: the review sheets (beats, five seams, phone width) and spot frames at every cue.
- **Nobody has listened to it.** The voice, the bed and the mix were chosen and checked by measurement only.

### Weakest shot, and what I would change

- 34.0-36.9 s: Codex's window holds only the struck diff line for about 3 s before the fix types in. With more time: open it on Codex's own edit summary, or bring the fix in on "picks up the same task".
- On a phone, terminal text sits at the 28 px floor: legible, small. A tighter crop on the briefing and the diff would help there.

### Warnings kept on purpose

- `line_unread` on Claude Code's reply in `carry`: the viewer read the same reply in the opening; here it is recognised, not read.
- `line_unread` on Codex's setup output (1.7 s): the voice says what it means ("One command each").
- `text_below_floor` on chips: measured while they spring in from 55% scale; at rest they are 24-26 px labels beside 30-56 px text.
