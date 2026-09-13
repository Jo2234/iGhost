import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { followOpenedPage } from "../lib/browser-tabs.mjs";

test("a noopener source link advances to its new page instead of inspecting the old tab again", async t => {
  const endpoint = http.createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ id: "new-source", webSocketDebuggerUrl: "ws://example.test/new-source" }]));
  });
  await new Promise(resolve => endpoint.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => endpoint.close(resolve)));
  let oldClosed = false;
  const calls = [];
  const next = { ready: async () => calls.push("ready"), send: async method => calls.push(method), close() {} };
  const session = {
    debugOrigin: `http://127.0.0.1:${endpoint.address().port}`,
    cdp: { send: async () => ({ targetInfos: [{ type: "page", targetId: "original" }, { type: "page", targetId: "new-source" }, { type: "service_worker", targetId: "worker" }] }), close() { oldClosed = true; } },
  };
  const followed = await followOpenedPage(session, new Set(["original"]), url => {
    assert.equal(url, "ws://example.test/new-source");
    return next;
  });
  assert.equal(followed, true);
  assert.equal(session.cdp, next);
  assert.equal(oldClosed, true);
  assert.deepEqual(calls, ["ready", "Page.enable", "Runtime.enable", "Page.bringToFront"]);
});

test("same-tab navigation keeps its existing connection", async () => {
  const current = { send: async () => ({ targetInfos: [{ type: "page", targetId: "original" }] }) };
  const session = { cdp: current };
  assert.equal(await followOpenedPage(session, new Set(["original"]), () => assert.fail("No new client expected")), false);
  assert.equal(session.cdp, current);
});

test("failed attachment preserves the current tab and closes the partial connection", async t => {
  const endpoint = http.createServer((_req, res) => res.end(JSON.stringify([{ id: "new", webSocketDebuggerUrl: "ws://example.test/new" }])));
  await new Promise(resolve => endpoint.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => endpoint.close(resolve)));
  const current = { send: async () => ({ targetInfos: [{ type: "page", targetId: "new" }] }), close() { assert.fail("Keep original connection"); } };
  const session = { cdp: current, debugOrigin: `http://127.0.0.1:${endpoint.address().port}` };
  let partialClosed = false;
  await assert.rejects(followOpenedPage(session, new Set(), () => ({ ready: async () => { throw new Error("Tab closed"); }, close() { partialClosed = true; } })), /Tab closed/);
  assert.equal(session.cdp, current);
  assert.equal(partialClosed, true);
});
