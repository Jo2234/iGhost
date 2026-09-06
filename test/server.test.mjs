import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

test("owner API gate, public reports, concurrent generation and mocked issue delivery", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ighost-api-test-"));
  const token = "synthetic-owner-access-token-for-tests";
  process.env.IGHOST_DATA_DIR = path.join(directory, "data");
  process.env.IGHOST_GENERATED_DIR = path.join(directory, "generated");
  process.env.IGHOST_ACCESS_TOKEN = token;
  process.env.OPENAI_API_KEY = "synthetic-no-service-calls";
  process.env.IGHOST_GITHUB_TOKEN = "synthetic-no-service-calls";
  process.env.IGHOST_REPO_URL = "https://github.com/example/approved";
  const { server, store, runTest, createCodexIssue } = await import("../server.mjs");
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Unexpected external service request"); };
  t.after(async () => {
    globalThis.fetch = originalFetch;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const request = (route, { method = "GET", authorized = false, body = {}, cookie, requestOrigin } = {}) => new Promise((resolve, reject) => {
    const headers = { "content-type": "application/json" };
    if (authorized) headers.authorization = `Bearer ${token}`;
    if (cookie) headers.cookie = cookie;
    if (requestOrigin) headers.origin = requestOrigin;
    const req = http.request(origin, { method, headers, path: route }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => { try { resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) }); } catch { resolve({ status: res.statusCode, headers: res.headers, body }); } });
    });
    req.on("error", reject);
    req.end(method === "POST" ? JSON.stringify(body) : undefined);
  });
  for (const route of ["/api/tests", "/api/tests/A/run", "/api/tests/A/ask", "/api/tests/A/codex-patch", "/api/tests/A/codex-patch/send"]) {
    assert.equal((await request(route, { method: "POST" })).status, 401, route);
  }
  assert.equal((await request("/api/tests/A")).status, 401);
  const login = await request("/api/session", { method: "POST", body: { token }, requestOrigin: origin });
  assert.equal(login.status, 200);
  const cookie = login.headers["set-cookie"][0].split(";")[0];
  assert.equal((await request("/api/session", { cookie })).status, 200);
  assert.equal((await request("/api/tests", { method: "POST", cookie, requestOrigin: "https://attacker.test" })).status, 401);

  const input = id => ({ id, status: "draft", screenshots: [], intendedTask: "Synthetic task", productName: "Synthetic product" });
  await store.create("tests", "A", input("A"));
  let release, reached;
  const paused = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { reached = resolve; });
  const calls = { live: 0, voice: 0, advice: 0, video: 0 };
  const dependencies = {
    live: async () => { calls.live++; reached(); await paused; return [{ stepOrder: 0, thought: "Synthetic thought", action: "stop" }]; },
    voice: async () => { calls.voice++; return { url: "/generated/audio/A.mp3", script: "Synthetic" }; },
    advice: async () => { calls.advice++; return { summary: "Synthetic", items: [] }; },
    video: async () => { calls.video++; return "/generated/video/A.mp4"; },
  };
  const run = runTest("A", dependencies);
  assert.equal(runTest("A", dependencies), run);
  await entered;
  await store.create("tests", "B", input("B"));
  await store.update("tests", "A", current => ({ ...current, followups: [{ question: "keep this" }] }));
  release();
  assert.equal((await run).status, "complete");
  assert.equal((await store.get("tests", "B")).id, "B");
  assert.equal((await store.get("tests", "A")).followups[0].question, "keep this");
  await runTest("A", dependencies);
  assert.deepEqual(calls, { live: 1, voice: 1, advice: 1, video: 1 });
  await store.create("tests", "Retry", input("Retry"));
  const retryCalls = { live: 0, voice: 0, advice: 0, video: 0 };
  const retry = {
    live: async () => { retryCalls.live++; return [{ stepOrder: 0, thought: "Saved step", action: "stop" }]; },
    voice: async () => { retryCalls.voice++; return { url: "/generated/audio/retry.mp3", script: "Saved voice" }; },
    advice: async () => { if (++retryCalls.advice === 1) throw new Error("Synthetic advice failure"); return { items: [] }; },
    video: async () => { retryCalls.video++; return "/generated/video/retry.mp4"; },
  };
  assert.equal((await runTest("Retry", retry)).status, "failed");
  assert.equal((await store.get("tests", "Retry")).walkthroughScript, "Saved voice");
  assert.equal((await runTest("Retry", retry)).status, "complete");
  assert.deepEqual(retryCalls, { live: 1, voice: 1, advice: 2, video: 1 });
  const reportSlug = (await store.get("tests", "A")).reportSlug;
  assert.equal((await request(`/api/reports/${reportSlug}`)).status, 404, "new reports stay private");
  assert.equal((await request("/api/tests/A/report", { method: "POST", body: { isPublic: true } })).status, 401);
  assert.equal((await request("/api/tests/A/report", { method: "POST", authorized: true, body: { isPublic: true } })).status, 200);
  await store.update("tests", "A", current => ({ ...current, codeContext: "private-code", customGhost: { profile: "private-profile" } }));
  const report = await request(`/api/reports/${reportSlug}`);
  assert.equal(report.status, 200);
  assert.equal(JSON.stringify(report.data).includes("private-code"), false);
  assert.equal(JSON.stringify(report.data).includes("private-profile"), false);
  await mkdir(path.join(directory, "generated", "video"), { recursive: true });
  await writeFile(path.join(directory, "generated", "video", "A.mp4"), "synthetic-media");
  assert.equal((await request("/generated/video/A.mp4")).status, 401);
  assert.equal((await request("/x/..//generated/video/A.mp4")).status, 401,
    "raw dot segments and repeated separators must not bypass media authorization");
  assert.equal((await request(report.data.test.videoUrl)).body, "synthetic-media");
  assert.equal((await request(`/generated/video/other.mp4?report=${reportSlug}`)).status, 401);

  await assert.rejects(createCodexIssue({ id: "A" }, { repoUrl: "https://github.com/example/unapproved", prompt: "synthetic" }), /not enabled/);
  let deliveries = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.github.com/repos/example/approved/issues");
    assert.equal(options.method, "POST");
    deliveries++;
    await new Promise(resolve => setTimeout(resolve, 25));
    return Response.json({ id: 1, number: 7, html_url: "https://github.com/example/approved/issues/7" });
  };
  const send = () => request("/api/tests/A/codex-patch/send", { method: "POST", authorized: true });
  const sent = await Promise.all([send(), send()]);
  assert.equal(sent[0].status, 200);
  assert.equal(sent[1].data.githubIssue.number, 7);
  assert.equal(deliveries, 1);
  assert.equal((await send()).status, 200);
  assert.equal(deliveries, 1);
  assert.equal((await request("/api/tests/A/codex-patch", { method: "POST", authorized: true })).status, 200);
  assert.equal((await send()).status, 200);
  assert.equal(deliveries, 1, "regenerating a prompt must not deliver a duplicate issue");
  assert.equal((await store.get("tests", "A")).followups.length, 1);
  // A send can finish while a regenerated prompt waits in the short write queue.
  // Preserve its delivery result from the latest record, not the pre-queue read.
  await store.create("tests", "DeliveryRace", { ...input("DeliveryRace"), status: "complete" });
  let unlockWrites, deliveryQueued, patchQueued;
  const writesBlocked = new Promise(resolve => { unlockWrites = resolve; });
  const sawDelivery = new Promise(resolve => { deliveryQueued = resolve; });
  const sawPatch = new Promise(resolve => { patchQueued = resolve; });
  store.queue = writesBlocked;
  const update = store.update.bind(store);
  let queued = 0;
  store.update = (...args) => {
    const result = update(...args);
    if (args[0] === "tests" && args[1] === "DeliveryRace") {
      if (++queued === 1) deliveryQueued();
      if (queued === 2) patchQueued();
    }
    return result;
  };
  try {
    const sending = request("/api/tests/DeliveryRace/codex-patch/send", { method: "POST", authorized: true });
    await sawDelivery;
    const regenerating = request("/api/tests/DeliveryRace/codex-patch", { method: "POST", authorized: true });
    await sawPatch;
    unlockWrites();
    assert.equal((await sending).status, 200);
    const regenerated = await regenerating;
    assert.equal(regenerated.status, 200);
    assert.equal(regenerated.data.codexPatch.githubIssue?.number, 7);
    assert.equal((await store.get("tests", "DeliveryRace")).codexPatch.githubIssue?.number, 7);
    const beforeRetry = deliveries;
    await request("/api/tests/DeliveryRace/codex-patch/send", { method: "POST", authorized: true });
    assert.equal(deliveries, beforeRetry, "regeneration must not erase an in-flight delivery result");
  } finally {
    unlockWrites();
    store.update = update;
  }

});
