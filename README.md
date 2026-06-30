# iGhost

**Summon AI users before real users rage-quit.**

AI usability testing that records synthetic user sessions, narrates the failure points, and turns them into actionable product fixes.

iGhost is an AI usability lab for builders who need fast, visceral feedback on a website or product flow. Paste a URL, give the ghost a job, choose the kind of user you want to emulate, and watch a synthetic user try the product in a narrated walkthrough.

Instead of another generic UX report, iGhost produces a playable ghost session: what the user saw, where they hesitated, what confused them, and what to fix next.

## What It Does

- Drives a browser through the target website.
- Captures the ghost's journey as an MP4 with a highlighted cursor.
- Generates a personality-matched OpenAI voiceover.
- Turns the walkthrough into actionable product advice.
- Creates a Codex-ready patch prompt from the findings.

## Product Loop

1. Add a website URL.
2. Describe what the ghost should try to do.
3. Choose or create a ghost persona.
4. Watch the ghost use the product.
5. Review concrete fixes.
6. Send the fix request to Codex for a branch/PR workflow.

## Quick Start

Requirements:

- Node.js 24 or newer
- Chrome, Chromium, Brave, or Edge for browser capture
- ffmpeg for MP4 generation
- An OpenAI API key

Create a `.env` file:

```bash
OPENAI_API_KEY="<your-openai-api-key>"
OPENAI_ANALYSIS_MODEL="<your-preferred-openai-model>"
OPENAI_TTS_MODEL="gpt-4o-mini-tts"
PORT=4173
```

Run the app:

```bash
npm start
```

Then open:

```txt
http://localhost:4173
```

## Voice

iGhost uses OpenAI speech generation for the final MP4 voiceover. The default TTS model is `gpt-4o-mini-tts`, with expressive stage directions passed through the `instructions` field so each ghost sounds like a real person thinking out loud instead of a narrator reading captions.

The reasoning and voiceover script layer uses `OPENAI_ANALYSIS_MODEL`. That model shapes what the ghost notices, how they interpret the screen, and the personality-specific script that is then performed by the TTS model.

## Routes

- `/` - landing page and ghost test form
- `/test/:testId` - generated walkthrough and advice
- `/api/tests/:testId/codex-patch` - create a Codex-ready patch request
- `/api/tests/:testId/codex-patch/send` - create a GitHub issue that tags `@codex` with the patch request

## Website Capture

When a user enters a website URL, iGhost launches a local browser, captures screenshots while the ghost navigates, and sends those screenshots to OpenAI vision along with the user's task prompt.

Set `CHROME_PATH` if your browser is not in a standard location.

## Render Deployment

The repo includes a Dockerfile and `render.yaml` Blueprint for Render. The container installs Chromium and ffmpeg, stores local data under the attached `/data` disk, and exposes `/health` for Render health checks.

Create a Blueprint from this GitHub repo in Render and provide `OPENAI_API_KEY` when prompted. The Blueprint uses the `starter` plan because browser capture and MP4 rendering need more headroom than a static/free deployment.

## Safety Notes

- Keep `.env` out of Git.
- Review Codex-generated changes before merging.
- Do not include private screenshots, API keys, or local data in public reports or GitHub issues.
- Public website URLs are validated before outbound fetches or browser capture. Localhost, private-network, link-local, reserved IP ranges, non-http schemes, and credentialed URLs are blocked to reduce SSRF risk.
- JSON API bodies are capped at 1 MB by default and API calls have a basic per-client rate limit. Tune with `IGHOST_RATE_LIMIT_MAX` and `IGHOST_RATE_LIMIT_WINDOW_MS`.

See `SECURITY_HARDENING_DEMO.md` for demo-ready validation examples and test coverage notes.
