# Demo video

`apps/web/public/demo/continuum-demo.mp4` is recorded from real sessions and narrated:
1. Claude Code fixes one of two bugs in a sample repository and stops.
2. Codex, briefed only by Continuum, finishes the same task.
3. You record a verified test run.
4. The real dashboard (`continuum serve`) shows the result.

To record it again:

```bash
# 1. The real run, with the published package. Uses your Claude Code and Codex accounts.
node scripts/demo-video/capture.mjs --work ~/continuum-demo --codex-model gpt-5.6-luna
# 2. Render the silent video and the poster, frame by frame at 1920×1080. Needs ffmpeg.
#    Run it right after step 1: the dashboard shows times like "5 min ago".
node scripts/demo-video/record.mjs --work ~/continuum-demo
# 3. Add the voiceover in narration.json (ElevenLabs; clips are cached, so re-runs cost no credits).
node scripts/demo-video/narrate.mjs            # or --tts say, to check the timing with the macOS voice for free
rm -rf ~/continuum-demo
```

- **The voiceover:** `narrate.mjs` reads the ElevenLabs key from `$ELEVENLABS_API_KEY` or `~/.config/elevenlabs/api-key`. Each line in `narration.json` starts with its scene. When a line runs longer than its scene, that scene's last frame is held until the line ends. The voice is ElevenLabs' "George" by default (`--voice <id>` changes it). The free plan allows about 10,000 characters a month; the script is about 900.
- **The silent master:** `continuum-demo.silent.mp4` is what `record.mjs` writes. Keeping it lets the voice be changed without recording again.

- **Terminal scenes:** these replay the captured output of each command (`capture.json`). `scenes.html` draws them.
- **Dashboard scene:** the recorder starts the real dashboard on the sample repository, scrolls through the project page, and shows the cursor and captions on top.
- **The npm package:** the video ships only with the website (`VITE_CONTINUUM_SITE=website`). `scripts/bundle.mjs` leaves it out of the package.
