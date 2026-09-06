import test from "node:test";
import assert from "node:assert/strict";
import { createOwnerAuth, publicTestView } from "../lib/auth.mjs";

test("owner sessions expire, reject forgery and require same-origin writes", () => {
  let now = 1000;
  const token = "test-only-owner-token-long-enough";
  const auth = createOwnerAuth(token, { now: () => now, secureCookies: true });
  const request = { method: "POST", headers: { host: "example.test", origin: "https://example.test" } };
  assert.equal(auth.login(request, "wrong"), null);
  assert.equal(auth.login({ ...request, headers: { ...request.headers, origin: "https://attacker.test" } }, token), null);
  const cookie = auth.login(request, token);
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  assert.match(cookie, /; Secure$/);
  request.headers.cookie = cookie.split(";")[0];
  assert.equal(auth.authorized(request), true);
  request.headers.origin = "https://attacker.test";
  assert.equal(auth.authorized(request), false);
  request.method = "GET";
  assert.equal(auth.authorized(request), true);
  const original = request.headers.cookie;
  request.headers.cookie = original + "x";
  assert.equal(auth.authorized(request), false);
  request.headers.cookie = original;
  now += 8 * 60 * 60 * 1000;
  assert.equal(auth.authorized(request), false);
  assert.equal(auth.authorized({ method: "POST", headers: { authorization: `Bearer ${token}` } }), true);
});

test("configuration fails closed and public report excludes private fields", () => {
  assert.throws(() => createOwnerAuth("short"), /IGHOST_ACCESS_TOKEN/);
  const view = publicTestView({ id: "test", codeContext: "private", screenshots: [{ url: "secret" }], followups: ["private"], codexPatch: { prompt: "private" }, ghosts: [{ name: "Mara", context: "private" }], videoUrl: "/generated/video/test.mp4" });
  assert.equal(JSON.stringify(view).includes("private"), false);
  assert.equal(view.videoUrl, "/generated/video/test.mp4");
});
