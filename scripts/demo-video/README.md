# Demo video

`apps/web/site-public/demo/continuum-demo.mp4` is a HyperFrames film, "The thread" (`film/`), built from a real run:
1. Claude Code fixes one of two bugs in a sample repository and stops.
2. Codex, briefed only by Continuum, finishes the same task.
3. You record a verified test run.
4. The real dashboard (`continuum serve`) shows one task carried from one agent to the next.

Every terminal line and dashboard pixel comes from that run. The exceptions are the re-explanation typed into a blank Codex session, which stands for you doing it by hand, and the repository path, which is shown as `~/code/pricing`. The voice is ElevenLabs' `eleven_v3` model, voice "Chris", read as one continuous take. The music bed and most effects were generated with ElevenLabs' sound model; the rest come from Pixabay's free library, through HyperFrames' bundled set.

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
| `film/compositions/*.html` | The scenes: `gap` (Claude stops, Codex starts blank, the thread becomes the logo), `connect`, `carry` (the task card into Codex's briefing), `finish` (the fix and the verified run), `dash` (the real dashboard), `close` (the claim and the end card). |
| `film/assets/audio/voice-timing.json` | The take's word timings, from ElevenLabs' alignment. Scenes cut on these words. |
| `film/capture-dashboard.mjs` | Screenshots the real dashboard for the `dash` scene. |
| `film/captions.mjs` | Writes the WebVTT captions from the word timings and where each line is placed. |
| `film/publish.mjs` | Encodes the render for the website and writes the captions next to it. |
| `capture.mjs` | Runs the real Claude Code and Codex sessions, and saves every command's output in `capture.json`. |

The video and its captions live in `apps/web/site-public/`, which only the website build (`VITE_CONTINUUM_SITE=website`) uses, so they never reach the npm package.
