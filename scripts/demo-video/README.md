# Demo video

`apps/web/site-public/demo/continuum-demo.mp4` is a HyperFrames film, "The thread" (`film/`), built from a real run:
1. Claude Code fixes one of two bugs in a sample repository and stops.
2. Codex, briefed only by Continuum, finishes the same task.
3. You record a verified test run.
4. The real dashboard (`continuum serve`) shows one task carried from one agent to the next.

Every terminal line and dashboard pixel comes from that run. The exceptions are the re-explanation typed into a blank Codex session, which stands for you doing it by hand, and the repository path, which is shown as `~/code/pricing`. It opens on the Continuum mark: the logo draws, the name types in, and the mark's start ring irises open onto the first terminal. The voice is ElevenLabs' `eleven_v4` model with "Mark - Natural Conversations", a professional voice clone from the Voice Library, read as one take of `film/voiceover.txt`: a script written to be spoken, with its fillers, one sigh and the stressed words in capitals. Scenes change through Remotion-style transitions (clock wipe, slide, flip, iris) and Runway-style ones (a liquid morph and a light leak), built on the real scenes. The music bed and most effects were generated with ElevenLabs' sound model; the rest come from Pixabay's free library, through HyperFrames' bundled set.

## Make it again

```bash
# 1. The real run, with the published package. Uses your Claude Code and Codex accounts.
node scripts/demo-video/capture.mjs --work ~/continuum-demo --codex-model gpt-5.6-luna
# 2. The real dashboard on that run, captured at 2x (needs `npm run build && npm run bundle`).
node scripts/demo-video/film/capture-dashboard.mjs --work ~/continuum-demo
# 3. Preview and edit the film; it is ordinary HTML.
cd scripts/demo-video/film && npx hyperframes preview
# 4. Render, then encode it for the website (phone-safe H.264, -16 LUFS) with its captions.
npx hyperframes render -q delivery -o renders/continuum-demo-master.mp4 && cd -
node scripts/demo-video/film/publish.mjs
# 5. Refresh the cover, which shows the length.
node scripts/site/images.mjs
rm -rf ~/continuum-demo
```

The terminal scenes quote the run's text directly. A new run words its replies differently, so re-read `capture.json` and update `compositions/gap.html`, `carry.html` and `finish.html` to match before rendering.

## How it is made

| File | What it does |
|---|---|
| `film/STORYLINES.md`, `film/SPEC.md` | The three storylines considered, and the picked one as a shot list, with every look and motion choice as a number. |
| `film/index.html` | The palette, the paper ground, six scene hosts, the voice cut into one clip per line, the music bed's volume envelope, and each effect placed so its peak lands a frame after its picture. |
| `film/compositions/organic-light-leak-overlay.html` | The registry's light leak, recoloured to the brand, over the claim's turn to paper. |
| `film/compositions/*.html` | The scenes: `intro` (the mark, the name typed in, the iris into the demo), `gap` (Claude stops, Codex starts blank, the thread becomes the logo), `connect`, `carry` (the task card into Codex's briefing), `finish` (the fix and the verified run), `dash` (the real dashboard), `close` (the claim and the end card). |
| `film/voiceover.txt` | The voiceover as sent to ElevenLabs: one paragraph per voice clip, audio tags in brackets. |
| `film/assets/audio/voice-timing.json` | The take's word timings, from ElevenLabs' alignment. Scenes cut on these words. |
| `film/capture-dashboard.mjs` | Screenshots the real dashboard for the `dash` scene. |
| `film/captions.mjs` | Writes the WebVTT captions from the word timings and where each line is placed. |
| `film/publish.mjs` | Encodes the render for the website and writes the captions next to it. |
| `capture.mjs` | Runs the real Claude Code and Codex sessions, and saves every command's output in `capture.json`. |

The video and its captions live in `apps/web/site-public/`, which only the website build (`VITE_CONTINUUM_SITE=website`) uses, so they never reach the npm package.

## The stale-test film

`stale-film/` is a second HyperFrames project, "Friday's green tick" (0:54, no narration): Friday, Claude Code's `unit` check passes; one line of `src/tax.js` changes by hand; Monday, Codex's briefing marks the check OUT OF DATE, the re-run fails, Codex fixes it and the run is verified again; the task replay shows where it went stale. It is published as `apps/web/site-public/demo/stale-test.mp4`.

```bash
# 1. Play the scenario through this checkout's CLI and MCP server (no agent accounts) into stale-film/assets/capture.json.
node scripts/demo-video/stale-film/capture.mjs --work ~/stale-film-work
# 2. Preview, render, encode for the website with its captions, refresh the cover.
cd scripts/demo-video/stale-film && npx hyperframes preview
npx hyperframes render -q delivery -o renders/stale-test-master.mp4 && cd -
node scripts/demo-video/stale-film/publish.mjs
node scripts/site/images.mjs
```

| File | What it does |
|---|---|
| `stale-film/STORYLINES.md`, `stale-film/SPEC.md` | The three storylines considered and the picked one as a shot list, including the two labelled edits to the captured text (the briefing's "Ran 2d ago" and the replay's clock times). |
| `stale-film/capture.mjs`, `stale-film/replay.ts` | Send the agents' hook payloads and task tool calls, run the checks, and save every output and the task replay. |
| `stale-film/compositions/*.html` | `friday` (the pass and the hand edit), `weekend`, `monday` (the briefing, the failing re-run, the fix), `replay` (the replay page rebuilt), `close`. |
| `stale-film/publish.mjs` | The same phone-safe encode as the first film, and captions from the on-screen headline. |
