# Product demo and evidence boundary

[Watch the product demo](product-demo.mp4) · [Play the silent sample replay](sample-replay.mp4)

The product demo is a continuous, real-time Playwright recording of the actual iGhost frontend in Chromium, encoded to H.264 MP4. No cuts, speed changes, reconstructed UI screens or remote accounts appear. The permanent banner and chapter captions were rendered in the browser while recording. Both the outer recording and the sample replay are silent. Narration synthesis is not demonstrated.

The demo uses a fictional trail-planning product, **Trailhead**, implemented in [an original local HTML fixture](../../tools/demo/fixtures/trailhead.html). Its intentional UX problem is a vague “Get started” button that leads to paid plans without explaining trial terms. The ghost's response and advice are scripted fixtures, not independent AI findings or evidence of improved conversion.

| What you see | What actually ran |
| --- | --- |
| Sign in and select a task/persona | Unmodified iGhost frontend and real owner session |
| Enter `https://trailhead.example` | Reserved example hostname; no request to that site |
| Create a walkthrough | Recorder substitutes the real authenticated screenshot-upload API for website capture |
| Browser observations and advice | Fixed synthetic inputs through the existing `runTest` dependency injection boundary |
| Narration | Omitted; no speech fixture or OpenAI speech request |
| Playback inside iGhost | Real `generateReplayVideo` ffmpeg encoder: screenshot frames, animated cursor and captions |
| Generate a Codex request | Real authenticated server endpoint, using the stored findings |
| GitHub delivery | Not invoked; recorder blocks and asserts zero send requests |

The sample replay is **a screenshot/cursor reconstruction**, not a continuous target-browser recording. The outer product demo is the continuous recording. Production authentication, URL validation and browser egress policy are unchanged. Local service data lives in a disposable temporary directory, and external model/service fetches are blocked. Only original fixture content and synthetic credentials are used.

The executable recorder asserts one create, one run, one patch request, zero send requests, a valid generated MP4, the expected patch evidence and no browser JavaScript errors. [recording-checks.json](recording-checks.json) records those results. Separate CI integration tests verify real Chromium egress enforcement and MP4 audio/video encoding; this demo is not a substitute for those tests.

## Reproduce

Use Node.js 24+, Chromium and ffmpeg. The app has no runtime npm dependencies; Playwright is isolated under the development-only recorder directory.

```sh
npm ci --prefix tools/demo
npx --prefix tools/demo playwright install chromium
FFMPEG_PATH=/usr/bin/ffmpeg node tools/demo/record.mjs
```

For an already-installed browser, also set `CHROME_PATH` to its executable. On macOS, set `FFMPEG_PATH` to the installed ffmpeg path. The recorder can use a preinstalled Playwright module through `IGHOST_PLAYWRIGHT_MODULE`. It overwrites the files in this directory, closes its isolated browser and removes its temporary server data afterward.

All committed media was generated from the original HTML fixture and the real app interface. No third-party speech recording or voice asset is included.
