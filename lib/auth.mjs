import crypto from "node:crypto";

const digest = value => crypto.createHash("sha256").update(String(value)).digest();

export function createOwnerAuth(token, { secureCookies = false, now = Date.now } = {}) {
  if (!token || token.length < 24) throw new Error("Set IGHOST_ACCESS_TOKEN to a random value of at least 24 characters before starting iGhost.");
  const expected = digest(token);
  const lifetime = 8 * 60 * 60 * 1000;
  // A process-local signing key invalidates sessions after restart without a
  // session database or exposing the long-lived access token to JavaScript.
  const signingKey = crypto.randomBytes(32);
  const signature = value => crypto.createHmac("sha256", signingKey).update(value).digest("hex");
  const matches = value => crypto.timingSafeEqual(digest(value || ""), expected);
  const sameOrigin = req => {
    if (!req.headers.origin) return false;
    try {
      const origin = new URL(req.headers.origin);
      return ["http:", "https:"].includes(origin.protocol) && origin.host === req.headers.host;
    } catch { return false; }
  };
  return {
    login(req, supplied) {
      if (!sameOrigin(req) || !matches(supplied)) return null;
      const payload = `${now() + lifetime}.${crypto.randomBytes(16).toString("hex")}`;
      return `ighost_session=${payload}.${signature(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetime / 1000}${secureCookies ? "; Secure" : ""}`;
    },
    authorized(req) {
      const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (bearer && matches(bearer)) return true;
      const cookie = String(req.headers.cookie || "").split(/;\s*/).find(value => value.startsWith("ighost_session="))?.slice(15);
      if (!cookie) return false;
      const parts = cookie.split(".");
      if (parts.length !== 3 || !Number.isFinite(Number(parts[0])) || Number(parts[0]) <= now()) return false;
      const payload = `${parts[0]}.${parts[1]}`;
      if (!crypto.timingSafeEqual(digest(parts[2]), digest(signature(payload)))) return false;
      return ["GET", "HEAD"].includes(req.method) || sameOrigin(req);
    },
  };
}

export function publicTestView(test) {
  return {
    id: test.id,
    productName: test.productName,
    status: test.status,
    videoUrl: test.videoUrl,
    actionableAdvice: test.actionableAdvice,
    ghosts: test.ghosts?.map(({ name, archetype }) => ({ name, archetype })),
  };
}
