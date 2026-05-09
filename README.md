# iGhost

iGhost is a dependency-free MVP of an AI-native usability lab. It lets a builder upload product-flow screenshots, describe the intended task, summon synthetic ghost users, watch rage-quit replays, review copy/layout fixes, see an annotated screenshot, copy a Codex-style patch, and open a public report.

## Run

This workspace currently has Node available through Codex but no package manager is required.

```bash
/Users/johanvaz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.mjs
```

Then open:

```txt
http://localhost:4173
```

## OpenAI configuration

The app reads `.env` automatically at server startup and keeps all OpenAI calls on the server. If `OPENAI_API_KEY` is not set, the app still runs with deterministic demo output so the product can be judged end-to-end.

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_ANALYSIS_MODEL="gpt-5.5"
export OPENAI_TTS_MODEL="gpt-4o-mini-tts"
```

## Routes

- `/` - landing page
- `/new` - create a ghost test
- `/test/:testId` - live session and results
- `/report/:slug` - public report

## Website capture

When a user enters a website URL, iGhost launches local headless Chrome/Brave/Edge/Chromium, captures a PNG screenshot at `1440x1100`, and passes that screenshot to OpenAI vision along with the task prompt. Uploaded screenshots are added after the website capture if both are provided.

Set `CHROME_PATH` if the browser is not in a standard macOS app location.

## Notes

- Public reports exclude pasted code context by default.
- Voice clips are generated only when `OPENAI_API_KEY` is configured.
- Voice playback is labeled as AI-generated in the interface.
- The current replay is an interactive, video-like playback experience with synchronized screenshots, ghost state, transcript, and voice. It does not export an MP4 yet.
- The fallback path is intentionally visible in the UI as `demo fallback`.
