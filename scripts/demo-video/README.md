# Demo video

`apps/web/site-public/demo/continuum-demo.mp4` comes from a real run, recorded and narrated:
1. Claude Code fixes one of two bugs in a sample repository and stops.
2. Codex, briefed only by Continuum, finishes the same task.
3. You record a verified test run.
4. The real dashboard (`continuum serve`) shows the result.

To record it again:

```bash
# 1. The real run, with the published package. Uses your Claude Code and Codex accounts.
node scripts/demo-video/capture.mjs --work ~/continuum-demo --codex-model gpt-5.6-luna
# 2. Render the video, poster and captions at 1920×1080, with the voiceover. Needs ffmpeg.
#    Run it right after step 1, so the dashboard shows times like "5 min ago".
node scripts/demo-video/record.mjs --work ~/continuum-demo
rm -rf ~/continuum-demo
```

`--stills 1,8,40` renders just those moments, as images in `<work>/stills`, for a quick look. `--tts say` uses the macOS voice to check timing for free.

## How it is made

| File | What it does |
|---|---|
| `capture.mjs` | Runs the real Claude Code and Codex sessions, and saves every command's output in `capture.json`. |
| `narration.json` | The voiceover: one line per scene, and one per beat in the dashboard scene. |
| `voice.mjs` | Speaks each line with ElevenLabs (George by default; `--voice <id>` changes it), cached in `~/.cache/continuum-demo-voice`, so unchanged lines cost no credits. The key comes from `$ELEVENLABS_API_KEY` or `~/.config/elevenlabs/api-key`. |
| `compose.html` | Draws any frame from its time: the animated logo intro and outro, the terminal windows (with the agents' logos), the browser frame around the dashboard, the transitions, and the corner logo. |
| `dashboardTour.mjs` | The dashboard scene: five beats that glide the scroll, cursor and zoom onto what each line describes. |
| `record.mjs` | Times every scene to its narration, so nothing is frozen, renders each frame (the dashboard is the real `continuum serve`), then adds the voice and writes the captions. |
| `mux.mjs` | Puts the voice on the video at -16 LUFS, and writes the WebVTT captions. |

The video and its captions live in `apps/web/site-public/`, which only the website build (`VITE_CONTINUUM_SITE=website`) uses, so they never reach the npm package. The free ElevenLabs plan allows about 10,000 characters a month; the script is about 900.
