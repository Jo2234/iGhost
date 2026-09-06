import http from "node:http";
import net from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolvePublicUrl } from "./security.mjs";

// Each browser session gets a loopback-only proxy. Both HTTP requests and HTTPS
// tunnels validate every DNS answer and connect to the validated IP directly.
// Chromium sends redirects, subresources and WebSockets through the same proxy.
export async function createEgressProxy({ resolve = resolvePublicUrl, connect = net.connect } = {}) {
  const sockets = new Set();
  let closed = false;
  const track = socket => {
    sockets.add(socket);
    // CONNECT/upgrade clients can reset before asynchronous DNS validation
    // finishes, when the HTTP server no longer owns their error handling.
    socket.on("error", () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
    socket.setTimeout(60_000, () => socket.destroy());
    return socket;
  };
  const server = http.createServer(async (req, res) => {
    try {
      const target = await resolve(req.url);
      if (closed || res.destroyed) return;
      const url = new URL(target.url);
      if (url.protocol !== "http:") throw new Error("Use CONNECT for HTTPS.");
      const headers = { ...req.headers, host: url.host, connection: "close" };
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      const agent = new http.Agent({ keepAlive: false });
      agent.createConnection = options => track(connect(options));
      const upstream = http.request({
        hostname: target.address,
        family: target.family,
        port: url.port || 80,
        path: `${url.pathname}${url.search}`,
        method: req.method,
        headers,
        agent,
      }, response => {
        res.writeHead(response.statusCode, response.headers);
        response.on("error", () => res.destroy());
        response.pipe(res);
      });
      upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.on("aborted", () => upstream.destroy());
      res.on("close", () => { upstream.destroy(); agent.destroy(); });
      req.pipe(upstream);
    } catch {
      res.writeHead(403);
      res.end("Destination blocked by iGhost network policy.");
    }
  });
  server.on("connection", track);
  server.on("connect", async (req, client, head) => {
    try {
      // Reject URL syntax in an authority; only hostname:port is permitted.
      if (!/^(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+):[0-9]+$/.test(req.url)) throw new Error("Invalid CONNECT target");
      const target = await resolve(`https://${req.url}/`);
      if (closed || client.destroyed) return;
      const url = new URL(target.url);
      const upstream = track(connect({ host: target.address, family: target.family, port: Number(url.port || 443) }));
      upstream.once("error", () => client.destroy());
      client.once("error", () => upstream.destroy());
      client.once("close", () => upstream.destroy());
      upstream.once("connect", () => {
        if (client.destroyed) return upstream.destroy();
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        client.pipe(upstream).pipe(client);
      });
    } catch {
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    }
  });
  // HTTP WebSocket upgrade must use the same pinned destination policy.
  server.on("upgrade", async (req, client, head) => {
    try {
      const target = await resolve(req.url.replace(/^ws:/, "http:"));
      if (closed || client.destroyed) return;
      const url = new URL(target.url);
      if (url.protocol !== "http:") throw new Error("Invalid upgrade target");
      const upstream = track(connect({ host: target.address, family: target.family, port: Number(url.port || 80) }));
      upstream.once("error", () => client.destroy());
      client.once("error", () => upstream.destroy());
      client.once("close", () => upstream.destroy());
      upstream.once("connect", () => {
        if (client.destroyed) return upstream.destroy();
        const headers = { ...req.headers, host: url.host };
        delete headers["proxy-authorization"];
        delete headers["proxy-connection"];
        upstream.write(`${req.method} ${url.pathname}${url.search} HTTP/1.1\r\n${Object.entries(headers).map(([k,v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
        if (head.length) upstream.write(head);
        client.pipe(upstream).pipe(client);
      });
    } catch {
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    }
  });
  server.maxConnections = 64;
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

export function browserEgressArguments(proxyUrl) {
  return [
    `--proxy-server=${proxyUrl}`,
    "--proxy-bypass-list=<-loopback>",
    "--disable-quic",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-extensions",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    // No direct hostname resolution fallback if the proxy is unavailable.
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
  ];
}

export async function prepareBrowserProfile(directory) {
  await mkdir(path.join(directory, "Default"), { recursive: true });
  // Chromium reads this privacy setting from the profile. The command-line
  // switch alone is not honored by every Chromium distribution/version.
  await writeFile(path.join(directory, "Default", "Preferences"), JSON.stringify({
    webrtc: {
      ip_handling_policy: "disable_non_proxied_udp",
      multiple_routes_enabled: false,
      nonproxied_udp_enabled: false,
    },
  }), { mode: 0o600, flag: "wx" });
}
