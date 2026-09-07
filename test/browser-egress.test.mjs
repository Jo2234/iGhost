import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import dgram from "node:dgram";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEgressProxy, browserEgressArguments, prepareBrowserProfile } from "../lib/egress.mjs";
import { resolvePublicUrl } from "../lib/security.mjs";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test("real Chromium cannot bypass the proxy for loopback subresources or redirects", { skip: !process.env.IGHOST_TEST_BROWSER, timeout: 30_000 }, async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ighost-browser-policy-"));
  let privateHits = 0, udpHits = 0, child, ws;
  const stun = dgram.createSocket("udp4");
  stun.on("message", () => { udpHits++; });
  await new Promise(resolve => stun.bind(0, "127.0.0.1", resolve));
  const privateServer = http.createServer((req, res) => { privateHits++; res.end("PRIVATE TARGET"); });
  await new Promise(resolve => privateServer.listen(0, "127.0.0.1", resolve));
  const privateUrl = `http://127.0.0.1:${privateServer.address().port}/private`;
  const fixture = http.createServer((req, res) => {
    if (req.url === "/redirect") { res.writeHead(302, { location: privateUrl }); res.end(); }
    else { res.setHeader("content-type", "text/html"); res.end(`<body>PUBLIC FIXTURE<img src="${privateUrl}"><iframe src="http://public.test/redirect"></iframe><script>
      const pc = new RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:${stun.address().port}'}]});
      pc.createDataChannel('synthetic'); pc.createOffer().then(offer => pc.setLocalDescription(offer));
    </script></body>`); }
  });
  await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
  const blocked = [];
  const proxy = await createEgressProxy({
    resolve: async value => {
      try {
        return await resolvePublicUrl(value, { lookup: async hostname => {
          if (hostname !== "public.test") throw new Error("Only synthetic fixture allowed");
          return [{ address: "93.184.216.34" }];
        } });
      } catch (error) { blocked.push(value); throw error; }
    },
    connect: () => net.connect({ host: "127.0.0.1", port: fixture.address().port }),
  });
  t.after(async () => {
    ws?.close();
    if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
    await proxy.close();
    stun.close();
    fixture.closeAllConnections();
    privateServer.closeAllConnections();
    await Promise.all([new Promise(resolve => fixture.close(resolve)), new Promise(resolve => privateServer.close(resolve))]);
    await rm(temporary, { recursive: true, force: true });
  });
  await prepareBrowserProfile(temporary);
  child = spawn(process.env.IGHOST_TEST_BROWSER, [
    "--headless", "--disable-gpu", "--no-sandbox", "--no-first-run", "--no-default-browser-check",
    ...browserEgressArguments(proxy.url), `--user-data-dir=${temporary}`,
    "--remote-debugging-port=0", "about:blank",
  ], { detached: true, stdio: ["ignore", "ignore", "pipe"] });
  let diagnostics = "";
  child.stderr.on("data", chunk => { diagnostics = (diagnostics + chunk).slice(-8000); });
  const deadline = Date.now() + 20_000;
  let debug;
  while (Date.now() < deadline && !debug) {
    debug = diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    if (!debug) await wait(100);
  }
  assert.ok(debug, "Browser must expose its local DevTools endpoint");
  const debugUrl = new URL(debug);
  const targets = await (await fetch(`http://${debugUrl.host}/json/list`)).json();
  ws = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  let serial = 0;
  const pending = new Map();
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    const callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); callback(message); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 5000);
    pending.set(id, message => { clearTimeout(timeout); message.error ? reject(new Error(message.error.message)) : resolve(message.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send("Page.navigate", { url: "http://public.test/" });
  let content = "";
  while (Date.now() < deadline) {
    content = (await send("Runtime.evaluate", { expression: "document.body?.innerText", returnByValue: true })).result.value || "";
    if (content.includes("PUBLIC FIXTURE") && blocked.some(url => url.includes("127.0.0.1"))) break;
    await wait(100);
  }
  assert.match(content, /PUBLIC FIXTURE/);
  await wait(2000);
  assert.equal(privateHits, 0);
  assert.equal(udpHits, 0, "WebRTC must not bypass the proxy with direct STUN UDP");
  assert.ok(blocked.some(url => url.includes("127.0.0.1")), "loopback navigation must reach the policy instead of bypassing it");
});
