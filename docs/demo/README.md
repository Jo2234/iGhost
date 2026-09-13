# Real API walkthrough and recording evidence

[Watch the 94-second walkthrough](product-demo.mp4) · [Play the complete generated replay with Ada’s voice](sample-replay.mp4) · [Captions](narration.vtt)

This recording demonstrates a real iGhost run on [Johan’s public portfolio](https://johan-vaz-site.vercel.app). Ada, the skeptical AI persona, is asked to find his AI projects and inspect evidence of his work. She scrolls the portfolio, opens the Equity Research Copilot’s public Source link, inspects its GitHub repository, opens the Jo2234 profile, and scrolls for more context.

The website captures, model decisions, generated speech and recommendations are actual outputs from this run. No fixture provider or scripted model responses supplied them. The recorded workflow creates a reviewable Codex prompt; it does not invoke GitHub issue delivery.

## What actually ran

| Stage | Evidence and execution |
| --- | --- |
| Task and persona | Normal authenticated iGhost frontend; public URL, concrete task and Ada selected |
| Browser decisions | Four `gpt-5.6-sol` Responses API calls receiving real browser screenshots and visible element data |
| Spoken script | One `gpt-5.6-sol` Responses API call using the recorded actions and thoughts |
| Native app voice | One `gpt-4o-mini-tts` speech request using the `sage` voice |
| Product advice | One `gpt-5.6-sol` Responses API call using the same observations |
| Replay | Actual ffmpeg output combining captured screenshots, cursor positions and generated audio |
| Codex prompt | Real authenticated server endpoint using the saved findings |

All **seven app-generation requests returned HTTP 200**. These counts exclude post-production caption timing: the native speech captions use Whisper-1 timestamps reviewed against the generated speech and captured app output. The four outer explanatory narration cues were generated locally with Kokoro’s generic `af_heart` voice. Both voices are synthetic; the on-screen banner discloses the AI persona and voice.

[recording-checks.json](recording-checks.json) publishes a sanitized execution summary, model IDs, source revisions, verification results, timing and asset hashes. Private credentials, authorization headers, local environment paths, saved application records and full private API logs are not part of this release.

## Editing and replay boundaries

The 93.808-second product video combines real Chromium interface recordings. It retains task entry and generation start, removes the generation wait, then shows the saved result from that same paid run. The transition is labeled on-screen and explained by the narrator. This is an edited walkthrough, not one continuous real-time recording.

Two defects discovered during live execution were corrected:

- **New-tab navigation:** Source links with a new-tab target, including `rel=noopener`, previously left the ghost attached to the original page. Commit `8feb69f` makes the isolated browser session follow its newly opened page. The successful recorded run then reached the real repository and public profile.
- **Visual duration:** The former ten-second-per-screen cap produced 40 seconds of visual frames for 60.36 seconds of speech. Commit `bd04dc1` measures actual audio duration with ffmpeg and distributes the visual timeline across the screenshots. The existing screenshots and speech were re-encoded locally, with no additional app API requests, and the corrected result was recorded playing through the normal UI.

The native replay contains 60.266667 seconds of video and 60.36 seconds of audio, a difference below 0.1 second. Its scenes share the measured duration; speech is not aligned word-by-word to each browser action. The replay is a **screenshot and cursor reconstruction** of the real browser session. The outer video records the actual iGhost interface displaying it.

The final edit preserves Ada’s native speech from 14.042 through 74.402 seconds. Four short explanatory cues surround it. The final narration/caption mux copied the edited source video packets unchanged; this does not imply the earlier capture assembly had no edits. The MP4 contains AAC audio and an optional subtitle track. [narration.json](narration.json) and [narration.vtt](narration.vtt) describe all 21 captions: four narrator cues and 17 Ada cues.

## What this establishes

The recording demonstrates working public-site capture, AI-driven browser choices, native speech generation, MP4 playback, advice and a prompt derived from the same saved run. The local syntax checks and all **28 tests passed**, with no skips, including real Chromium egress enforcement, new-tab regression cases, and an ffmpeg test that checks the visual stream itself when narration exceeds the former duration cap.

This is one four-step synthetic participant session. Its recommendations need review; they do not prove that every suggested feature is absent, establish human usability findings, or demonstrate improved conversion. GitHub delivery and an implemented product fix are outside this recording.

## Run your own real session

Follow the repository’s [Quick Start](../../README.md#quick-start) with Node.js 24+, Chromium, ffmpeg, a private owner token and your own OpenAI API key. To use the models shown here, set `OPENAI_ANALYSIS_MODEL=gpt-5.6-sol` and `OPENAI_TTS_MODEL=gpt-4o-mini-tts`. Enter a public website URL and a concrete browsing task, choose a persona, then generate and play its walkthrough. Real model outputs, timing and costs vary; these instructions run a new session rather than reproducing identical footage.

The implementation follows the official OpenAI [vision](https://developers.openai.com/api/docs/guides/images-vision) and [text-to-speech](https://developers.openai.com/api/docs/guides/text-to-speech) interfaces. Model availability depends on your API project.

## Legacy offline development harness

[tools/demo/record.mjs](../../tools/demo/record.mjs) remains an offline frontend/encoder harness. It uses the original [Trailhead HTML fixture](../../tools/demo/fixtures/trailhead.html), substitutes fixed navigation and advice, blocks external provider calls and omits native narration synthesis. It does **not** generate the current real API footage.

```sh
npm ci --prefix tools/demo
npx --prefix tools/demo playwright install chromium
FFMPEG_PATH=/usr/bin/ffmpeg node tools/demo/record.mjs
```

Set `CHROME_PATH` and `FFMPEG_PATH` for your installed binaries as needed. A preinstalled Playwright module can be supplied through `IGHOST_PLAYWRIGHT_MODULE`. The harness writes its clearly labeled synthetic output to ignored `tools/demo/output/`, protecting the published real-run assets in this directory. The historical synthetic public recording remains in Git history.
