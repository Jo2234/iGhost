import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { createEgressProxy, browserEgressArguments } from "../lib/egress.mjs";
import { resolvePublicUrl } from "../lib/security.mjs";

async function listen(server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

function request(proxy, target) {
  return new Promise((resolve, reject) => {
    const req = http.get(proxy, { path: target }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
  });
}

test("HTTP proxy pins public DNS answers, blocks rebinding and redirected/subresource destinations", async t => {
  const fixture = http.createServer((req, res) => {
    if (req.url === "/redirect") { res.writeHead(302, { location: "http://127.0.0.1/private" }); res.end(); }
    else res.end(`${req.headers.host}${req.url}`);
  });
  const port = await listen(fixture);
  const dialed = [];
  let privateAnswer = false;
  const proxy = await createEgressProxy({
    resolve: value => resolvePublicUrl(value, { lookup: async () => [{ address: privateAnswer ? "127.0.0.1" : "93.184.216.34" }] }),
    connect: options => { dialed.push(options.host || options.hostname); return net.connect({ host: "127.0.0.1", port }); },
  });
  t.after(async () => { await proxy.close(); await new Promise(resolve => fixture.close(resolve)); });
  assert.equal((await request(proxy.url, "http://public.test/page?q=1")).body, "public.test/page?q=1");
  assert.deepEqual(dialed, ["93.184.216.34"]);
  const redirected = await request(proxy.url, "http://public.test/redirect");
  assert.equal(redirected.status, 302);
  assert.equal((await request(proxy.url, redirected.headers.location)).status, 403);
  for (const url of ["http://[::ffff:7f00:1]/", "http://[fe81::1]/", "http://10.0.0.1/subresource", "file:///etc/passwd"]) {
    assert.equal((await request(proxy.url, url)).status, 403, url);
  }
  privateAnswer = true;
  assert.equal((await request(proxy.url, "http://public.test/rebound")).status, 403);
  assert.equal(dialed.length, 2, "blocked requests must not create a socket");
});

test("CONNECT blocks private targets and tunnels only to the validated address", async t => {
  const fixture = net.createServer(socket => socket.on("data", data => socket.write(data)));
  const port = await listen(fixture);
  const dialed = [];
  const proxy = await createEgressProxy({
    resolve: value => resolvePublicUrl(value, { lookup: async () => [{ address: "93.184.216.34" }] }),
    connect: options => { dialed.push(options.host); return net.connect({ host: "127.0.0.1", port }); },
  });
  t.after(async () => { await proxy.close(); await new Promise(resolve => fixture.close(resolve)); });
  const tunnel = target => new Promise((resolve, reject) => {
    const req = http.request(proxy.url, { method: "CONNECT", path: target });
    req.on("connect", (res, socket) => { socket.destroy(); resolve(res.statusCode); });
    req.on("error", reject);
    req.end();
  });
  assert.equal(await tunnel("public.test:443"), 200);
  assert.deepEqual(dialed, ["93.184.216.34"]);
  for (const target of ["127.0.0.1:443", "[::ffff:7f00:1]:443", "user@public.test:443"]) assert.equal(await tunnel(target), 403);
  assert.equal(dialed.length, 1);
});

test("WebSocket upgrades are validated before any socket opens", async t => {
  let dials = 0;
  const proxy = await createEgressProxy({ connect: () => { dials++; throw new Error("Unexpected connection"); } });
  t.after(() => proxy.close());
  const result = await new Promise((resolve, reject) => {
    const req = http.request(proxy.url, { path: "ws://127.0.0.1/private", headers: { connection: "Upgrade", upgrade: "websocket" } }, res => { res.resume(); resolve(res.statusCode); });
    req.on("error", reject);
    req.end();
  });
  assert.equal(result, 403);
  assert.equal(dials, 0);
  const flags = browserEgressArguments(proxy.url);
  assert.ok(flags.includes("--proxy-bypass-list=<-loopback>"));
  assert.ok(flags.includes("--disable-quic"));
  assert.ok(flags.includes("--force-webrtc-ip-handling-policy=disable_non_proxied_udp"));
});

test("client resets during destination validation do not crash the proxy or open a connection", async t => {
  let release, entered, dials = 0;
  const blocked = new Promise(resolve => { release = resolve; });
  const resolving = new Promise(resolve => { entered = resolve; });
  const proxy = await createEgressProxy({
    resolve: async () => { entered(); await blocked; throw new Error("Synthetic denied destination"); },
    connect: () => { dials++; throw new Error("Unexpected connection"); },
  });
  t.after(() => proxy.close());
  const socket = net.connect({ host: "127.0.0.1", port: Number(new URL(proxy.url).port) });
  socket.on("error", () => {});
  await new Promise(resolve => socket.once("connect", resolve));
  socket.write("CONNECT denied.test:443 HTTP/1.1\r\nHost: denied.test:443\r\n\r\n");
  await resolving;
  socket.resetAndDestroy();
  await new Promise(resolve => setTimeout(resolve, 30));
  release();
  assert.equal((await request(proxy.url, "http://denied.test/")).status, 403);
  assert.equal(dials, 0);
});
