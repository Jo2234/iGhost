// Development-only recorder. No production route, auth or egress policy is changed.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const output = path.join(root, "docs/demo");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.IGHOST_PLAYWRIGHT_MODULE || "playwright");
const temporary = await mkdtemp(path.join(os.tmpdir(), "ighost-demo-"));
const ffmpeg = process.env.FFMPEG_PATH || "/usr/bin/ffmpeg";
const token = "synthetic-demo-owner-token-not-a-secret";
// Override inherited credentials before importing the app. All data is disposable.
Object.assign(process.env, {
  IGHOST_ACCESS_TOKEN: token,
  IGHOST_DATA_DIR: path.join(temporary, "data"),
  IGHOST_GENERATED_DIR: path.join(temporary, "generated"),
  OPENAI_API_KEY: "synthetic-demo-no-service-calls",
  IGHOST_GITHUB_TOKEN: "", GITHUB_TOKEN: "", IGHOST_REPO_URL: "",
  NODE_ENV: "test", FFMPEG_PATH: ffmpeg,
});
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("External service calls are disabled in this recorder"); };
const { server, store, runTest } = await import("../../server.mjs");
let browser, context;
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  // Capture actual browser-rendered screens of an original, local HTML fixture.
  const fixture = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await fixture.route("**/*", route => route.abort());
  await fixture.setContent(await readFile(path.join(here, "fixtures/trailhead.html"), "utf8"));
  const home = await fixture.screenshot();
  await fixture.locator("#start").click();
  const pricing = await fixture.screenshot();
  await fixture.close();
  const dataUrl = buffer => `data:image/png;base64,${buffer.toString("base64")}`;
  const advice = {
    summary: "Explain the price before asking for commitment.",
    items: [
      { title: "Show the starting price earlier", why: "Mara reaches paid plans before learning that the product costs money.", change: "Place the $9/month starting price and accurate trial terms beside the first CTA." },
      { title: "Make the next step explicit", why: "Get started leads to pricing, although the task was to try the product first.", change: "Rename the homepage CTA to View plans and provide a trial path only if one exists." },
    ],
  };
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: temporary, size: { width: 1280, height: 900 } } });
  // This banner is recorded in the live browser, never added to the video later.
  await context.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const banner = document.createElement("aside");
      banner.id = "demo-provenance";
      banner.style.cssText = "position:fixed;z-index:99999;bottom:0;left:0;right:0;padding:13px 25px;background:#14291ff5;border-top:1px solid #55ec88;color:#fff;font:16px/1.5 system-ui;pointer-events:none";
      banner.innerHTML = '<b style="font-size:12px;color:#80efa4;letter-spacing:1px">SYNTHETIC DEMO · SCRIPTED MODEL RESPONSES · SILENT REPLAY</b><div id="demo-caption">A real recording of the iGhost interface, using a local test fixture.</div>';
      document.body.append(banner);
    });
  });
  const calls = { create: 0, run: 0, patch: 0, sends: 0 };
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.endsWith("/codex-patch/send")) { calls.sends++; return route.abort(); }
    if (url.pathname.endsWith("/codex-patch")) calls.patch++;
    if (url.pathname === "/api/tests" && request.method() === "POST") {
      calls.create++;
      // Exercise the real authenticated screenshot-upload API. No public DNS or
      // website capture is claimed: only the demo's capture boundary is replaced.
      const body = request.postDataJSON();
      assert.equal(body.websiteUrl, "https://trailhead.example");
      const response = await route.fetch({ postData: { ...body, websiteUrl: "", productName: "Trailhead (demo fixture)", screenshots: [{ url: dataUrl(home), title: "Synthetic Trailhead homepage" }] } });
      return route.fulfill({ response });
    }
    const run = url.pathname.match(/^\/api\/tests\/([^/]+)\/run$/);
    if (run) {
      calls.run++;
      // Existing dependency injection used by the server tests; real persistence,
      // replay encoder and downstream patch endpoint still run unchanged.
      const result = await runTest(run[1], {
        live: async (_test, ghost) => [
          { stepOrder: 0, ghostId: ghost.id, action: "click", thought: "Get started does not explain whether there is a free trial.", screenshotUrl: dataUrl(home), cursor: { x: 148, y: 398 } },
          { stepOrder: 1, ghostId: ghost.id, action: "observe", thought: "Both options are paid. I cannot find a way to try it first.", screenshotUrl: dataUrl(pricing), cursor: { x: 170, y: 363 } },
          { stepOrder: 2, ghostId: ghost.id, action: "stop", thought: "Explain pricing and trial terms before asking me to commit.", screenshotUrl: dataUrl(pricing), cursor: { x: 170, y: 494 } },
        ],
        voice: async () => ({ url: null, script: "" }),
        advice: async () => advice,
      });
      assert.equal(result.status, "complete");
      assert.ok(result.videoUrl, result.videoError);
      const test = await store.update("tests", result.id, current => ({ ...current, aiMode: "synthetic-demo" }));
      await copyFile(path.join(process.env.IGHOST_GENERATED_DIR, test.videoUrl.replace("/generated/", "")), path.join(output, "sample-replay.mp4"));
      return route.fulfill({ json: { test } });
    }
    return route.continue();
  });
  const page = await context.newPage();
  const video = page.video();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const caption = text => page.locator("#demo-caption").evaluate((element, value) => { element.textContent = value; }, text);
  const hold = ms => page.waitForTimeout(ms); // Intentional pacing for the recording.
  await page.goto(origin);
  const started = Date.now();
  await page.getByRole("heading", { name: "Welcome to iGhost." }).waitFor();
  await caption("01 / Sign in to the private, single-owner usability lab.");
  await hold(2000);
  await page.locator('[name="token"]').fill(token);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator("#run-form").waitFor();
  await caption("02 / Give the ghost a concrete job. This fictional site is captured locally.");
  await hold(3000);
  await page.locator('[name="websiteUrl"]').pressSequentially("https://trailhead.example", { delay: 40 });
  await page.locator('[name="intendedTask"]').pressSequentially("Find a weekend trail and check whether I can try the product before paying.", { delay: 30 });
  await hold(2500);
  await caption("03 / Choose a persona: Mara is an impatient first-time visitor.");
  await page.locator('[value="skeptical"]').check();
  await hold(2000);
  await page.locator('[value="impatient"]').check();
  await hold(3000);
  await caption("04 / Generate the walkthrough. Model decisions are fixed demo inputs; narration synthesis is omitted.");
  await page.getByRole("button", { name: "Generate walkthrough", exact: true }).click();
  await page.locator(".walkthrough-video").waitFor({ timeout: 120_000 });
  await page.evaluate(() => scrollTo(0, 0));
  await caption("05 / Play the MP4: iGhost reconstructs screenshots and cursor movement. This replay is silent.");
  await page.locator("video").evaluate(async element => { element.muted = true; await element.play(); });
  await hold(8000);
  await page.screenshot({ path: path.join(output, "product.png") });
  await hold(6000);
  await page.locator("video").evaluate(element => element.pause());
  await page.locator(".advice-panel").scrollIntoViewIfNeeded();
  await caption("06 / Review specific changes tied to what confused the synthetic user.");
  await hold(9000);
  await page.locator("#codex-request").scrollIntoViewIfNeeded();
  await caption("07 / Generate a scoped Codex prompt from the findings and recorded evidence.");
  await page.locator("#codex-request").click();
  await page.locator("#codex-prompt").waitFor();
  await page.locator("#codex-prompt").scrollIntoViewIfNeeded();
  assert.match(await page.locator("#codex-prompt").inputValue(), /Show the starting price earlier/);
  await hold(6500);
  await page.locator("#codex-prompt").evaluate(element => { element.scrollTop = 410; });
  await caption("08 / Inspect the evidence and proposed changes. The GitHub send action is not used.");
  await hold(5000);
  await page.evaluate(() => scrollTo(0, 0));
  await caption("URL + task → persona → replay → actionable advice → reviewable patch prompt.");
  await hold(Math.max(4000, 76_000 - (Date.now() - started)));
  assert.deepEqual(calls, { create: 1, run: 1, patch: 1, sends: 0 });
  assert.deepEqual(errors, []);
  await context.close();
  context = null;
  const recording = await video.path();
  const encoded = spawnSync(ffmpeg, ["-y", "-i", recording, "-c:v", "libx264", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(output, "product-demo.mp4")], { encoding: "utf8", timeout: 120_000 });
  assert.equal(encoded.status, 0, encoded.stderr);
  await writeFile(path.join(output, "recording-checks.json"), JSON.stringify({ viewport: "1280x900", recording: "Continuous Playwright browser recording; no cuts or time compression; captions rendered live", externalServices: "Blocked; scripted navigation and analysis; narration synthesis omitted", uiCalls: calls, browserErrors: errors, screenshots: "Original local HTML fixture rendered in Chromium", appRevision: "See git history for the recording commit" }, null, 2) + "\n");
  console.log(`Verified demo written to ${output}`);
} finally {
  await context?.close();
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = originalFetch;
  await rm(temporary, { recursive: true, force: true });
}
