# iGhost

iGhost is a dependency-free MVP for generating ghost walkthrough videos. Paste a website URL, describe what the ghost should try, choose a personality, and iGhost opens the site, drives the browser, creates a natural OpenAI voiceover, and renders a playable MP4 with a highlighted cursor.

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

The app reads `.env` automatically at server startup and keeps all OpenAI calls on the server. `OPENAI_API_KEY` is required for every walkthrough.

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_ANALYSIS_MODEL="gpt-5.5"
export OPENAI_TTS_MODEL="gpt-4o-mini-tts"
```

## Routes

- `/` - landing page
- `/test/:testId` - generated MP4 walkthrough output

## Website capture

When a user enters a website URL, iGhost launches local headless Chrome/Brave/Edge/Chromium, captures screenshots while the ghost navigates, and passes those screenshots to OpenAI vision along with the task prompt.

Set `CHROME_PATH` if the browser is not in a standard macOS app location.

## Notes

- MP4 rendering uses a working local `ffmpeg`. If one is not available, the server installs a local `imageio-ffmpeg` encoder under `.vendor/`.
- Voiceover is generated with OpenAI speech from a spoken monologue script, not from step labels.
