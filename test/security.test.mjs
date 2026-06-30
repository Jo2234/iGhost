import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import {
  createRateLimiter,
  normalizeUrl,
  parseJsonBody,
  validatePublicUrl,
} from "../lib/security.mjs";

function jsonRequest(payload, headers = {}) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const stream = Readable.from([body]);
  stream.headers = { "content-type": "application/json", "content-length": String(body.length), ...headers };
  return stream;
}

test("normalizeUrl preserves public http/https URLs and adds https by default", () => {
  assert.equal(normalizeUrl("example.com/path?q=1#secret"), "https://example.com/path?q=1");
  assert.equal(normalizeUrl("http://example.com/"), "http://example.com/");
});

test("normalizeUrl rejects private, localhost, non-http, and credentialed targets", () => {
  const blocked = [
    "localhost",
    "http://127.0.0.1:8080",
    "http://10.0.0.5",
    "http://172.16.0.1",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "file:///etc/passwd",
    "https://user:pass@example.com/",
  ];
  for (const url of blocked) {
    assert.throws(() => normalizeUrl(url), /Website URL/);
  }
});

test("validatePublicUrl rejects hostnames that resolve to private addresses", async () => {
  await assert.rejects(
    validatePublicUrl("https://metadata.google.internal", {
      lookup: async () => [{ address: "169.254.169.254", family: 4 }],
    }),
    /private network|localhost|link-local/,
  );
});

test("validatePublicUrl accepts hostnames only when every resolved address is public", async () => {
  await assert.equal(
    await validatePublicUrl("https://example.com", {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    }),
    "https://example.com/",
  );

  await assert.rejects(
    validatePublicUrl("https://mixed.example", {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.10.10.10", family: 4 },
      ],
    }),
    /private network|localhost|link-local/,
  );
});

test("parseJsonBody enforces valid JSON, content type, and size limit", async () => {
  assert.deepEqual(await parseJsonBody(jsonRequest('{"ok":true}')), { ok: true });

  await assert.rejects(parseJsonBody(jsonRequest("not-json")), /valid JSON/);
  await assert.rejects(
    parseJsonBody(jsonRequest('{"ok":true}', { "content-type": "text/plain" })),
    /application\/json/,
  );
  await assert.rejects(
    parseJsonBody(jsonRequest('{"too":"large"}', { "content-length": "100" }), { limitBytes: 10 }),
    /too large/,
  );
});

test("createRateLimiter allows requests within a window and blocks excess", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
  assert.equal(limiter("client", 0).allowed, true);
  assert.equal(limiter("client", 100).allowed, true);
  assert.equal(limiter("client", 200).allowed, false);
  assert.equal(limiter("client", 1100).allowed, true);
});
