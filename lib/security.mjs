import dns from "node:dns/promises";
import net from "node:net";

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 1_000_000;
export const DEFAULT_RATE_LIMIT = Object.freeze({ windowMs: 60_000, max: 60 });

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

export class RequestValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "RequestValidationError";
    this.statusCode = statusCode;
  }
}

export function normalizeUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
    throw new RequestValidationError("Website URL must start with http or https.");
  }
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new RequestValidationError("Website URL must be a valid http or https URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new RequestValidationError("Website URL must start with http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new RequestValidationError("Website URL must not include embedded credentials.");
  }
  parsed.hash = "";
  assertPublicHostname(parsed.hostname);
  return parsed.toString();
}

export async function validatePublicUrl(rawUrl, { lookup = dns.lookup } = {}) {
  return (await resolvePublicUrl(rawUrl, { lookup })).url;
}

// Resolve once, validate every answer, and return the exact address to dial.
// Callers must not resolve the hostname again when making the connection.
export async function resolvePublicUrl(rawUrl, { lookup = dns.lookup } = {}) {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return { url: "" };
  const parsed = new URL(normalized);
  const hostname = canonicalHostname(parsed.hostname);
  assertPublicHostname(hostname);

  if (net.isIP(hostname)) {
    assertPublicAddress(hostname);
    return { url: normalized, address: hostname, family: net.isIP(hostname) };
  }

  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new RequestValidationError("Website URL hostname could not be resolved.");
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new RequestValidationError("Website URL hostname could not be resolved.");
  }
  for (const record of records) {
    assertPublicAddress(record.address);
  }
  return { url: normalized, address: records[0].address, family: net.isIP(records[0].address) };
}

export function assertPublicHostname(hostname) {
  const host = canonicalHostname(hostname);
  if (!host) throw new RequestValidationError("Website URL must include a hostname.");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    throw new RequestValidationError("Website URL cannot target localhost or private network hosts.");
  }
  if (host.includes("%")) {
    throw new RequestValidationError("Website URL cannot include scoped IP addresses.");
  }
  if (net.isIP(host)) assertPublicAddress(host);
}

function canonicalHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

export function assertPublicAddress(address) {
  if (!isPublicAddress(address)) {
    throw new RequestValidationError("Website URL cannot target localhost, link-local, or private network addresses.");
  }
}

export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPublicIPv4(address);
  if (family === 6) return isPublicIPv6(address);
  return false;
}

function isPublicIPv4(address) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0) return false; // current network
  if (a === 10) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return false; // protocol assignments/documentation
  if (a === 192 && b === 88 && parts[2] === 99) return false;
  if (a === 198 && b === 51 && parts[2] === 100) return false;
  if (a === 203 && b === 0 && parts[2] === 113) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast/reserved/broadcast
  return true;
}

function isPublicIPv6(address) {
  let value = address.toLowerCase();
  if (value.includes(".")) {
    const split = value.lastIndexOf(":");
    const bytes = value.slice(split + 1).split(".").map(Number);
    value = `${value.slice(0, split)}:${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const [left, right] = value.split("::");
  const head = left ? left.split(":") : [];
  const tail = right ? right.split(":") : [];
  const words = right !== undefined
    ? [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail].map(word => parseInt(word, 16))
    : head.map(word => parseInt(word, 16));
  if (words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff) {
    return isPublicIPv4([words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255].join("."));
  }
  // Only global unicast, excluding special-use and documentation blocks.
  // This also excludes all of fe80::/10, ULA, multicast and translation ranges.
  if ((words[0] & 0xe000) !== 0x2000) return false;
  if (words[0] === 0x2001 && (words[1] < 0x0200 || words[1] === 0x0db8)) return false;
  if (words[0] === 0x2002 || (words[0] === 0x3fff && words[1] < 0x1000)) return false;
  return true;
}

export async function parseJsonBody(req, { limitBytes = DEFAULT_JSON_BODY_LIMIT_BYTES } = {}) {
  const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
  if (contentType && !contentType.includes("application/json")) {
    throw new RequestValidationError("Request body must be application/json.", 415);
  }
  const declaredLength = Number(req.headers?.["content-length"] || 0);
  if (declaredLength > limitBytes) {
    throw new RequestValidationError("JSON body is too large.", 413);
  }

  let raw = "";
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new RequestValidationError("JSON body is too large.", 413);
    raw += chunk;
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new RequestValidationError("Request body must contain valid JSON.");
  }
}

export function createRateLimiter({ windowMs = DEFAULT_RATE_LIMIT.windowMs, max = DEFAULT_RATE_LIMIT.max } = {}) {
  const buckets = new Map();
  return function rateLimit(key, now = Date.now()) {
    const bucketKey = key || "unknown";
    const current = buckets.get(bucketKey);
    if (!current || now >= current.resetAt) {
      const resetAt = now + windowMs;
      buckets.set(bucketKey, { count: 1, resetAt });
      return { allowed: true, remaining: max - 1, resetAt };
    }
    current.count += 1;
    return {
      allowed: current.count <= max,
      remaining: Math.max(0, max - current.count),
      resetAt: current.resetAt,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  };
}

export function getClientIp(req) {
  // Untrusted clients can supply X-Forwarded-For; do not let it reset limits.
  return req.socket?.remoteAddress || "unknown";
}
