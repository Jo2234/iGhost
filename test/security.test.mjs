import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import {
  createRateLimiter,
  normalizeUrl,
  parseJsonBody,
  validatePublicUrl,
  resolvePublicUrl,
  isPublicAddress,
  getClientIp,
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

test("IPv6 classification handles mapped and full link-local CIDRs", async () => {
  for (const address of ["::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:a00:1", "fe81::1", "fe8f::1", "febf::1", "ff02::1", "2001:db8::1", "2002:7f00:1::"]) {
    assert.equal(isPublicAddress(address), false, address);
    assert.throws(() => normalizeUrl(`http://[${address}]/`));
  }
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicAddress("::ffff:93.184.216.34"), true);
  await assert.rejects(validatePublicUrl("https://example.test", { lookup: async () => [{ address: "::ffff:7f00:1" }] }));
  assert.deepEqual(await resolvePublicUrl("https://example.test", { lookup: async () => [{ address: "93.184.216.34" }] }), {
    url: "https://example.test/", address: "93.184.216.34", family: 4,
  });
});

test("forwarded headers cannot select a new rate-limit identity", () => {
  assert.equal(getClientIp({ headers: { "x-forwarded-for": "spoofed" }, socket: { remoteAddress: "127.0.0.1" } }), "127.0.0.1");
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
