# iGhost architecture and roadmap

**iGhost — Summon AI users before real users rage-quit.**

iGhost is a single-owner usability lab: give a synthetic persona a website and task, capture its browser actions, and review a narrated replay with proposed improvements. Its output is a set of hypotheses to investigate with real users, not statistically representative user research.

This document describes the current implementation. [README.md](README.md) contains setup/deployment instructions; [SECURITY_HARDENING_DEMO.md](SECURITY_HARDENING_DEMO.md) maps security claims to runnable checks. The original product specification is preserved in [Git history](https://github.com/Jo2234/iGhost/blob/d26fb356af2416a6eb3f12b4b87fe1e8859a1ff3/iGhost_product_engineering_spec.md). Its aspirational feature list and build schedule should not be read as shipped functionality.

## Runtime

The application uses Node.js 24 or newer, a built-in HTTP server in [server.mjs](server.mjs), and plain HTML/CSS/JavaScript in `public/`. There is no React application, external Node dependency tree, database service or job worker. Chromium-compatible browsers supply capture and interaction through the Chrome DevTools Protocol (CDP); ffmpeg renders MP4 media.

| Module | Responsibility |
| --- | --- |
| `server.mjs` | Routes, browser/CDP sessions, OpenAI requests, generation stages, media rendering and GitHub issue delivery |
| `public/app.js` | Owner sign-in, test form, result playback, advice, follow-up questions and patch handoff |
| `lib/auth.mjs` | Owner authentication and allowlisted public report fields |
| `lib/security.mjs` | URL/IP validation, JSON body limits and basic request rate limiting |
| `lib/egress.mjs` | Per-browser egress proxy, Chromium network arguments and profile policy |
| `lib/store.mjs` | JSON record storage, legacy migration, queued updates and in-flight request deduplication |
| `lib/media.mjs` | Mapping public media URLs into the configured generated directory |

## Generation path

```text
Owner: URL + task + persona
        ↓
Initial screenshot → saved test → run request
                                  ↓
                     isolated Chromium/CDP session
                     screenshot + visible elements
                                  ↓
                     OpenAI action selection (up to 4 steps)
                                  ↓
                     saved actions/thoughts/screenshots
                         ├→ script → OpenAI speech → MP3
                         ├→ actionable advice
                         └→ ffmpeg screenshot/cursor replay → MP4
                                  ↓
                     private report + optional GitHub handoff
```

1. `POST /api/tests` validates the website URL, captures an initial screenshot, accepts optional uploaded screenshots, and stores the requested task and persona. Current tests use one preset or custom ghost.
2. `POST /api/tests/:id/run` joins duplicate in-flight requests for that test. A fresh browser session uses a temporary profile. At each of at most four steps, OpenAI receives a screenshot, visible clickable element descriptors, page state, persona, task and prior action types. The executable actions are click, scroll and stop. There is no general form-filling or login workflow.
3. The selected action is executed through CDP. Each saved step retains its pre-action screenshot, thought, action, action label and cursor position. Browser process groups, proxy and temporary profile are cleaned up when the session closes.
4. The analysis model writes a persona-specific narration from the observed step descriptions. OpenAI speech generation produces the MP3, using the ghost's voice and performance instructions. A separate analysis call produces up to three advice items with a title, reason and concrete change.
5. ffmpeg combines still screenshots, a rendered moving cursor, text overlays and narration into an MP4. This is a reconstructed replay, **not a continuous recording of the browser**; transition timing and cursor interpolation are synthesized.
6. Successful stages are saved before later work starts. Retries reuse saved steps, audio and advice; video errors are recorded separately so advice can remain available. A test may be marked complete while `videoUrl` is absent and `videoError` explains the failure. Other generation failures set a failed status and retain completed stages.

`OPENAI_ANALYSIS_MODEL` selects the reasoning/vision model and `OPENAI_TTS_MODEL` selects speech. These are deployment settings, not guarantees of model availability. OpenAI supplies model reasoning and speech; persona presets, patience values, cursor overlays, storage and patch-prompt assembly are ordinary application code.

## Evidence and limitations

- Findings should identify the task, observed step and concrete change. The recorded thought and advice are model outputs, not a real participant's testimony. Patience decreases and reaction emotions are assigned by application logic; they are not calibrated behavioral measurements.
- Only the first ghost is run. Multi-persona comparison, statistically grounded rage-quit detection, generated avatar behavior, annotated screenshots and separate before/after rewrite tooling from the original specification are not completed features.
- The API accepts screenshot-only input, but the current live-session function returns no steps without a website URL. The generation path does not implement the original multi-screenshot simulation design. Use a website URL for a meaningful browser walkthrough; screenshot-only analysis remains work to complete.
- A screenshot is captured before each action; a final action's result may not appear if the step budget ends. Four steps cannot establish completion of an arbitrary user journey.
- Follow-up questions use the stored persona, reaction and a stored screenshot. The current reaction-to-screenshot mapping can resolve to the initial capture rather than the corresponding live step, so follow-ups are not guaranteed to reflect the exact clicked screen.
- Network blocking is not an action-approval system. A model-selected click can affect the public target website. There is no authenticated target session or production-grade policy for consequential actions.
- The app does not run an autonomous code editor. `buildCodexPatch` constructs a prompt from findings and task evidence; an optional GitHub issue is a handoff, not proof of a code change or PR.

Keep these distinctions in demos and reports. Validate important product decisions with real users and inspect model advice against the actual screen. No accuracy, conversion uplift or production reliability benchmark is established by the current test suite.

## Persistence and provenance

`IGHOST_DATA_DIR` contains individual `tests/<id>.json` and `reports/<slug>.json` records. Test records retain inputs, screenshot order/source labels, timestamps, persona, steps, reactions, audio/script, advice, media/error state, follow-ups and patch-delivery results. Report records control public visibility and refer back to a test.

Legacy `data/db.json` is migrated without modifying the original backup. Writes use a short in-process queue and atomic replacement; malformed JSON fails loudly. In-flight deduplication and write serialization only coordinate **one server process**. Back up the full data directory together with generated media; shared multi-replica writes require transactional storage.

`IGHOST_GENERATED_DIR` controls the audio/video files independently of public `/generated/...` URLs. Do not infer the filesystem path from a URL outside the checked resolver. The Docker/Render configuration keeps both records and assets under the persistent `/data` disk.

Website captures and uploaded content remain content supplied by the target site or uploader. OpenAI generates the synthetic interpretation and voice; Chromium supplies browser execution and ffmpeg supplies encoding. Those service/tool roles are attribution of the pipeline, not ownership claims over third-party screenshots. Existing source history and demonstration documents remain available; a saved demo is not evidence of a fresh model run.

## Access and network boundaries

- Startup requires a random `IGHOST_ACCESS_TOKEN` of at least 24 characters. Private APIs and generated media require an owner session or bearer token. Browser sessions use HttpOnly, SameSite=Strict cookies, last eight hours and expire on restart; cookie-authenticated mutations require a matching Origin. Production cookies are Secure and require HTTPS.
- Local serving binds to `127.0.0.1` by default. Docker intentionally binds to all interfaces behind the deployment's HTTPS endpoint. This is a single-owner service, with no tenant isolation or per-user roles.
- Every capture/browser session uses a loopback egress proxy. All DNS answers must pass public-address validation; the proxy connects to the selected IP without a second DNS resolution. HTTP, HTTPS CONNECT and WebSocket upgrades pass through the same boundary, including redirected and subresource requests. Chromium's implicit loopback proxy bypass, QUIC and non-proxied WebRTC UDP are disabled.
- Private, link-local, mapped-private and special-use destinations fail closed. This is a browser network policy, not an OS sandbox: the launch currently includes `--no-sandbox`. Keep the browser updated and run the service separately from sensitive workloads.
- JSON API bodies are limited to 1 MB by default and APIs have a basic per-client rate limit. Client identity for this limit uses the direct peer IP, not caller-supplied forwarding headers; clients behind one reverse proxy share that limit.
- Screenshots, task/persona details and selected context are sent to OpenAI for the applicable model calls. This is not an offline workflow. Keep secrets out of uploaded content, prompts and public handoffs.

## Reports and GitHub handoff

Reports begin private. The owner can `POST /api/tests/:id/report` with `{"isPublic":true}` to expose the redacted JSON at `/api/reports/:slug`, and `false` to revoke access. The public view allows display fields, advice, ghost names/archetypes and a report-scoped video link; it omits uploaded screenshots, code context, private persona profiles, follow-ups and patch prompts. The shared video and generated advice can still reveal target-site content. Migrated reports retain their previous visibility.

`POST /api/tests/:id/codex-patch` creates the reviewable prompt. `/codex-patch/send` can create an issue mentioning `@codex` only for the configured `IGHOST_REPO_URL`, with `IGHOST_GITHUB_TOKEN` or `GITHUB_TOKEN`. No local `gh` credentials are used. Success requires GitHub's confirmed issue response, and subsequent sends reuse a recorded issue, including after prompt regeneration. Issue delivery does not guarantee Codex execution, a branch, or a PR; inspect and review any resulting changes before merging.

## Remaining roadmap

1. Complete screenshot-only flow analysis and preserve exact step-to-screenshot references in follow-ups, advice and public evidence views.
2. Add explicit task-completion evidence and stronger structured-output validation before expanding beyond four click/scroll/stop actions. Add action policy and approval controls before supporting forms, credentials or consequential workflows.
3. Evaluate findings against human usability sessions, recording disagreement and model/configuration provenance. Keep any multi-persona comparison exploratory until validated.
4. Add a dedicated report-view/sharing UI, retention/deletion controls and clearer export choices for sensitive media. The current sharing interface is a redacted JSON endpoint.
5. Introduce a durable job queue and transactional storage only when multi-process operation is needed, with cancellation, resource budgets and recovery tests.

## Validation

Run `npm run check` and `npm test` on Node.js 24 or newer. Checks cover syntax, authentication/report redaction, URL and egress policy, JSON storage/migration, generation retry behavior, frontend contracts and mocked GitHub delivery. The MP4 smoke test runs when ffmpeg is available; real browser egress coverage is opt-in with `IGHOST_TEST_BROWSER=/path/to/chromium npm test`.

These tests use synthetic data and mocked paid/external service boundaries. They do not establish live model quality, successful real-world target navigation, or a completed deployment. See the README for runtime prerequisites and the security demo document for the specific covered failure modes.
