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

## Hosting

This MVP should be hosted as a persistent Node service, because a walkthrough needs a real browser process, ffmpeg video rendering, and durable storage for generated MP4 files.

Recommended production shape:

- Frontend on Vercel or the same backend host.
- Walkthrough worker on a container/server host such as Render, Railway, Fly.io, DigitalOcean, or AWS.
- Generated videos in object storage such as Vercel Blob, S3, or Cloudflare R2.
- `OPENAI_API_KEY`, `OPENAI_ANALYSIS_MODEL`, and `OPENAI_TTS_MODEL` configured as server environment variables.

Vercel can host the frontend, but the current all-in-one server is not a clean Vercel deployment target without splitting the browser/video worker out of the request path.

## Render deployment

The repo includes a Dockerfile and `render.yaml` Blueprint for Render. The container installs Chromium and ffmpeg, stores local data under the attached `/data` disk, and exposes `/health` for Render health checks.

Create a Blueprint from this GitHub repo in Render and provide `OPENAI_API_KEY` when prompted. The Blueprint uses the `starter` plan because browser capture and MP4 rendering need more headroom than a static/free deployment.

## Notes

- MP4 rendering uses a working local `ffmpeg`. If one is not available, the server installs a local `imageio-ffmpeg` encoder under `.vendor/`.
- Voiceover is generated with OpenAI speech from a spoken monologue script, not from step labels.
