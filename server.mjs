import http from "node:http";
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir, stat } from "node:fs/promises";
import { existsSync, createWriteStream, createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawn } from "node:child_process";
import {
  createRateLimiter,
  getClientIp,
  parseJsonBody,
  RequestValidationError,
  validatePublicUrl,
} from "./lib/security.mjs";

const root = process.cwd();
const publicDir = path.join(root, "public");
const dataDir = process.env.IGHOST_DATA_DIR || path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");
const generatedDir = process.env.IGHOST_GENERATED_DIR || path.join(publicDir, "generated");
const audioDir = path.join(generatedDir, "audio");
const videoDir = path.join(generatedDir, "video");
const cursorPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACQ0lEQVR4nO1bO5bDIAyU9FylSJ06F0qxR8k59ihb7IW2dk2xrbfZws/PHwmNwDw8ZSCIGQYZMCa6cOFCz+CSwaZpemrrMvNPbG/+49BJCNcShM9OPFoIboV4lBDcGnG0ENIyeUR8rhD8rqiTSjmBCxHXkIaIYRWCA8l7SLvEsIggDZFXt2tx6EBYRBFfi2HOEy4HTMeqliCvjqd1AVci/9gpG41tJU8+4ILk90h7xcgWYSAf7kHEl/8dFf1I8Bww7Y9+NHlrO/ccHgPF4BHYpjVH5Dlgyh/9CPLa9s0ukIwOlH7chfZPwDus6NF3xVnjNVClTn1/0tfyt9ebPozx3PmAjQ5wz/014g4h9gRImjWBEAYw8pZ6iCknpU54DKSy6mux5MdHFRD23yLzetPvrM4tczq4psFAfphtOCe+/G1LiKhkKBQMr5WjpkIxATSjbylvXoCzQahzSOmAR0kuIwmeW4CXbXkL//8RBkAbY8Y+4KZdByjjZ4NB5wCPiMeZcvS3BNg8IpsvhGSvEAmrlaOsH7UZGpGkQLvBkO2waxqAzwPc9kcLUPJEKGsTpJ4CnJ8HoCe26DhrvCSjHchLyUCY+idbBQcuSBVdALF+9IuRMSAnhAgre4UOF6A7rWnHPPoIByTFi4ix9tvhPbCmUtf3A058Q8RN3vQYVDSWWiMf8RRIBdwAFVoslQ0rxCg3wO8Jck4vur4pOke3d4XPdFvce4gjNYMj4I3PuK50/MXIEt1+M7REt1+NtfTd4IUL1Df+AO3fA5QZtENGAAAAAElFTkSuQmCC";

await mkdir(dataDir, { recursive: true });
await mkdir(audioDir, { recursive: true });
await mkdir(videoDir, { recursive: true });

await loadEnvFile();

const PORT = Number(process.env.PORT || 4173);
const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.5";
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const apiRateLimit = createRateLimiter({
  windowMs: Number(process.env.IGHOST_RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.IGHOST_RATE_LIMIT_MAX || 60),
});

async function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return;
  const lines = (await readFile(envPath, "utf8")).split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [rawKey, ...rawValueParts] = trimmed.split("=");
    const key = rawKey.trim();
    const value = rawValueParts.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function loadDb() {
  if (!existsSync(dbPath)) {
    return { tests: {}, reports: {} };
  }
  try {
    return JSON.parse(await readFile(dbPath, "utf8"));
  } catch {
    return { tests: {}, reports: {} };
  }
}

async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers,
  });
  res.end(payload);
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function requireOpenAiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required. Add it to .env and restart the server.");
  }
}

function extractOutputText(json) {
  return json.output_text || json.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("") || "";
}

function safeSlug(text) {
  const base = String(text || "ghost-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${base || "ghost-report"}-${crypto.randomBytes(3).toString("hex")}`;
}

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(url, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await wait(150);
  }
  throw new Error("Timed out waiting for browser debugging endpoint.");
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message || "Chrome DevTools error."));
        else resolve(message.result);
        return;
      }
      const listeners = this.events.get(message.method) || [];
      listeners.forEach((listener) => listener(message.params || {}));
    });
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  once(method, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeout);
      const listener = (params) => {
        clearTimeout(timer);
        this.events.set(method, (this.events.get(method) || []).filter((item) => item !== listener));
        resolve(params);
      };
      this.events.set(method, [...(this.events.get(method) || []), listener]);
    });
  }

  close() {
    this.ws.close();
  }
}

async function launchBrowserSession(url) {
  const safeUrl = await validatePublicUrl(url);
  const browser = findBrowserExecutable();
  if (!browser) throw new Error("No supported browser found for live website session.");
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ighost-live-"));
  const port = 9300 + Math.floor(Math.random() * 600);
  const child = spawn(browser, [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1440,1100",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(tempDir, "profile")}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  try {
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const page = targets.find((target) => target.type === "page") || targets[0];
    const cdp = new CdpClient(page.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.navigate", { url: safeUrl });
    await cdp.once("Page.loadEventFired", 12000).catch(() => {});
    await wait(1200);
    return { cdp, child, tempDir };
  } catch (error) {
    child.kill("SIGKILL");
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function closeBrowserSession(session) {
  try {
    session.cdp?.close();
  } catch {}
  try {
    session.child?.kill("SIGKILL");
  } catch {}
  await rm(session.tempDir, { recursive: true, force: true });
}

async function captureCdpScreenshot(cdp) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  return `data:image/png;base64,${result.data}`;
}

async function getClickableElements(cdp) {
  const expression = `(() => {
    const candidates = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[tabindex]')];
    return candidates.map((el, index) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.href || '').trim().replace(/\\s+/g, ' ');
      return { index, tag: el.tagName.toLowerCase(), text, href: el.href || '', x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: rect.width > 4 && rect.height > 4 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && style.visibility !== 'hidden' && style.display !== 'none' };
    }).filter(item => item.visible).slice(0, 30);
  })()`;
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true });
  return result.result?.value || [];
}

async function getPageState(cdp) {
  const expression = `(() => ({
    scrollY,
    innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    canScroll: scrollY + innerHeight < document.documentElement.scrollHeight - 20
  }))()`;
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true });
  return result.result?.value || { scrollY: 0, innerHeight: 1100, scrollHeight: 1100, canScroll: false };
}

async function chooseGhostAction(test, ghost, step, screenshotUrl, elements, pageState, priorActions) {
  const prompt = `You are controlling a browser as a synthetic usability participant.

Product/task: ${test.intendedTask}
Ghost/persona: ${JSON.stringify(ghost)}
Step: ${step}
Page state: ${JSON.stringify(pageState)}
Prior actions: ${JSON.stringify(priorActions)}
Clickable elements: ${JSON.stringify(elements)}

Choose one next action that this ghost would actually take. Prefer realistic website actions: click a visible CTA, open a menu, scroll for more context, or stop if the task is blocked.
For broad discovery tasks, scroll at least once when the page has more content and the ghost has not already scrolled. Use scroll when the current screen does not fully answer the user's instruction.

Return only JSON:
{"thought":"first-person thought while using the page","action":"click|scroll|stop","targetIndex":number|null,"reason":"short reason"}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: screenshotUrl, detail: "high" }] }],
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const json = await response.json();
  const text = extractOutputText(json);
  const cleaned = cleanJsonText(text);
  return JSON.parse(cleaned);
}

async function performGhostAction(cdp, action, elements) {
  if (action.action === "scroll") {
    await cdp.send("Runtime.evaluate", { expression: "window.scrollBy({ top: Math.round(window.innerHeight * 0.75), behavior: 'instant' })" });
    await wait(1000);
    return { x: 1180, y: 620, label: "Scroll down" };
  }
  if (action.action === "click") {
    const target = elements.find((item) => item.index === action.targetIndex) || elements[0];
    if (target) {
      const x = clamp(Math.round(target.x + target.width / 2), 1, 1439);
      const y = clamp(Math.round(target.y + target.height / 2), 1, 1099);
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      await wait(1700);
      return { x, y, label: target.text || target.href || "Click" };
    }
  }
  return { x: 720, y: 520, label: "Stop" };
}

async function runLiveGhostSession(test, ghost) {
  if (!test.websiteUrl) return [];
  const session = await launchBrowserSession(test.websiteUrl);
  const steps = [];
  try {
    for (let step = 0; step < 4; step++) {
      const screenshotUrl = await captureCdpScreenshot(session.cdp);
      const elements = await getClickableElements(session.cdp);
      const pageState = await getPageState(session.cdp);
      const action = await chooseGhostAction(test, ghost, step, screenshotUrl, elements, pageState, steps.map((item) => item.action));
      const cursor = await performGhostAction(session.cdp, action, elements);
      steps.push({
        id: id("live"),
        stepOrder: step,
        ghostId: ghost.id,
        screenshotUrl,
        thought: action.thought,
        action: action.action,
        actionLabel: cursor.label || action.reason,
        cursor,
      });
      if (action.action === "stop") break;
    }
    return steps;
  } finally {
    await closeBrowserSession(session);
  }
}

async function captureWebsiteScreenshot(url) {
  const normalizedUrl = await validatePublicUrl(url);
  const browser = findBrowserExecutable();
  if (!browser) {
    throw new Error("No supported browser found for website capture. Install Chrome, Brave, Edge, or Chromium.");
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ighost-capture-"));
  const screenshotPath = path.join(tempDir, "capture.png");
  const args = [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1440,1100",
    `--screenshot=${screenshotPath}`,
    normalizedUrl,
  ];

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Website capture timed out."));
      }, 30000);
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 && existsSync(screenshotPath)) {
          resolve();
        } else {
          reject(new Error(stderr.trim() || `Browser capture failed with exit code ${code}.`));
        }
      });
    });
    const image = await readFile(screenshotPath);
    return {
      url: `data:image/png;base64,${image.toString("base64")}`,
      label: new URL(normalizedUrl).hostname,
      capturedUrl: normalizedUrl,
      capturedAt: new Date().toISOString(),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function buildScreenshots(body, testId) {
  const screenshots = [];
  if (body.websiteUrl) {
    const capture = await captureWebsiteScreenshot(body.websiteUrl);
    screenshots.push({
      id: id("screen"),
      testId,
      url: capture.url,
      order: screenshots.length,
      label: `Website: ${capture.label}`,
      note: `Captured from ${capture.capturedUrl} at ${capture.capturedAt}`,
      source: "website_capture",
      capturedUrl: capture.capturedUrl,
    });
  }
  for (const [index, screen] of (body.screenshots || []).entries()) {
    screenshots.push({
      id: id("screen"),
      testId,
      url: screen.url,
      order: screenshots.length,
      label: screen.label || `Upload ${index + 1}`,
      note: screen.note || "",
      source: "upload",
    });
  }
  return screenshots;
}

async function fetchWebsiteContext(url) {
  if (!url) return "";
  try {
    const safeUrl = await validatePublicUrl(url);
    const response = await fetch(safeUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "user-agent": "iGhost usability test bot",
      },
    });
    const html = await response.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() || "";
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "";
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return [
      `URL: ${safeUrl}`,
      title && `Title: ${title}`,
      description && `Description: ${description}`,
      h1 && `Primary heading: ${h1}`,
      `Visible text excerpt: ${text.slice(0, 5000)}`,
    ].filter(Boolean).join("\n");
  } catch (error) {
    return `URL: ${url}\nWebsite fetch failed: ${error.message}`;
  }
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function lowerFirst(value) {
  const text = String(value || "");
  return text ? text[0].toLowerCase() + text.slice(1) : text;
}

function defaultGhosts(test) {
  if (test.ghostProfile === "custom" && test.customGhost?.name && test.customGhost?.profile) {
    const name = String(test.customGhost.name).trim().slice(0, 48);
    const profile = String(test.customGhost.profile).trim().slice(0, 800);
    return [{
      id: id("ghost"),
      testId: test.id,
      name,
      archetype: "Custom user persona",
      goal: `Complete the assigned task while behaving according to this profile: ${profile}`,
      context: profile,
      patienceInitial: 74,
      skepticism: 45,
      color: "#16a34a",
      voice: "marin",
      voiceDirection: `Sound like ${name}, a real person thinking out loud rather than narrating. Keep the delivery conversational, specific, and emotionally responsive to the screen. Let this persona shape the rhythm and emphasis: ${profile}`,
    }];
  }
  const profiles = {
    impatient: {
      name: "Mara",
      archetype: "Impatient first-time user",
      goal: `Quickly decide whether ${test.productName} is worth trying.`,
      patienceInitial: 70,
      skepticism: 45,
      color: "#ff7a59",
      voice: "verse",
      voiceDirection: "Sound like a fast-moving first-time user who is slightly impatient but not rude. Use clipped, practical phrasing, quick reactions, and a little urgency when the page makes her work too hard.",
    },
    unsure: {
      name: "Nico",
      archetype: "Unsure non-technical user",
      goal: "Understand the product without decoding jargon.",
      patienceInitial: 82,
      skepticism: 30,
      color: "#16a34a",
      voice: "cedar",
      voiceDirection: "Sound warm, tentative, and human. Use gentle hesitation, self-checking phrases, and a softer pace when the page feels unclear, like someone trying to avoid making a mistake.",
    },
    skeptical: {
      name: "Ada",
      archetype: "Skeptical technical buyer",
      goal: "Look for proof, privacy, and workflow fit before trusting it.",
      patienceInitial: 68,
      skepticism: 80,
      color: "#45d6c5",
      voice: "sage",
      voiceDirection: "Sound calm, observant, and analytical, with restrained skepticism. Use measured emphasis when claims need proof, and keep the tone thoughtful rather than performative.",
    },
  };
  const ghost = profiles[test.ghostProfile] || profiles.impatient;
  return [{
    id: id("ghost"),
    testId: test.id,
    ...ghost,
  }];
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error("Expected a base64 data URL.");
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return { width: 1440, height: 1100 };
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function runCommand(command, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${path.basename(command)} timed out.`));
    }, timeout);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${path.basename(command)} failed with exit code ${code}.`));
    });
  });
}

function runCommandCapture(command, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${path.basename(command)} timed out.`));
    }, timeout);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `${path.basename(command)} failed with exit code ${code}.`));
    });
  });
}

async function commandWorks(command, args = ["-version"], timeout = 8000) {
  try {
    await runCommand(command, args, timeout);
    return true;
  } catch {
    return false;
  }
}

async function vendorFfmpegCandidates() {
  const dir = path.join(root, ".vendor", "python", "imageio_ffmpeg", "binaries");
  if (!existsSync(dir)) return [];
  const files = await readdir(dir).catch(() => []);
  return files
    .filter((file) => file.startsWith("ffmpeg"))
    .map((file) => path.join(dir, file));
}

async function findPythonExecutable() {
  const candidates = [
    process.env.PYTHON,
    "python3",
    "python",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await commandWorks(candidate, ["--version"], 5000)) return candidate;
  }
  throw new Error("Python 3 is required to install the local MP4 encoder.");
}

async function installVendorFfmpeg() {
  const python = await findPythonExecutable();
  const target = path.join(root, ".vendor", "python");
  await mkdir(target, { recursive: true });
  await runCommand(python, ["-m", "pip", "install", "--quiet", "--target", target, "imageio-ffmpeg"], 120000);
}

async function findFfmpegExecutable() {
  const candidates = [
    process.env.FFMPEG_PATH,
    ...(await vendorFfmpegCandidates()),
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate) && (await commandWorks(candidate))) return candidate;
  }

  await installVendorFfmpeg();
  for (const candidate of await vendorFfmpegCandidates()) {
    if (existsSync(candidate) && (await commandWorks(candidate))) return candidate;
  }

  throw new Error("A working ffmpeg encoder is required to generate the MP4.");
}

function ffmpegText(value, maxLength = 82) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .slice(0, maxLength)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/'/g, "")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function cleanJsonText(text) {
  return String(text || "").replace(/^```json\s*|\s*```$/g, "").trim();
}

function thoughtForReaction(reaction) {
  return reaction.quote || reaction.reaction || reaction.interpretation || reaction.evidence || "I am scanning this screen and deciding what to do next.";
}

function pointForStep(index, total) {
  const points = [
    { x: 0.2, y: 0.28 },
    { x: 0.5, y: 0.48 },
    { x: 0.74, y: 0.58 },
    { x: 0.34, y: 0.72 },
  ];
  return points[index % Math.min(points.length, Math.max(1, total))];
}

function renderedCursor(step, source, index, total) {
  const point = step.cursor ? { x: clamp(step.cursor.x / source.width, 0.02, 0.98), y: clamp(step.cursor.y / source.height, 0.02, 0.98) } : pointForStep(index, total);
  const scale = Math.min(1120 / source.width, 500 / source.height);
  const displayWidth = Math.round(source.width * scale);
  const displayHeight = Math.round(source.height * scale);
  const originX = Math.round((1280 - displayWidth) / 2);
  const originY = 28;
  return {
    x: clamp(Math.round(originX + point.x * displayWidth), 40, 1240),
    y: clamp(Math.round(originY + point.y * displayHeight), 40, 520),
  };
}

function cursorExpression(start, end, axis, offset = 0) {
  const from = Math.round(start[axis]);
  const to = Math.round(end[axis]);
  const delta = to - from;
  if (!delta) return String(to + offset);
  return `'if(lt(t\\,1.15)\\,${from}+(${delta})*t/1.15\\,${to})${offset < 0 ? offset : `+${offset}`}'`;
}

async function generateReplayVideo(test) {
  const ffmpeg = await findFfmpegExecutable();
  const replaySteps = test.sessionSteps?.length
    ? test.sessionSteps.map((step) => ({
        screenshotUrl: step.screenshotUrl,
        thought: step.thought,
        ghostId: step.ghostId,
        cursor: step.cursor,
      }))
    : (test.reactions || []).slice(0, 8).map((reaction) => ({
        screenshotUrl: (test.screenshots.find((item) => item.id === reaction.screenshotId) || test.screenshots[0])?.url,
        thought: thoughtForReaction(reaction),
        ghostId: reaction.ghostId,
        cursor: null,
      }));
  if (!replaySteps.length) return null;

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ighost-video-"));
  const font = "/System/Library/Fonts/Supplemental/Arial.ttf";
  const cursorPath = path.join(tempDir, "cursor.png");
  const segments = [];
  const scriptWords = String(test.walkthroughScript || "").trim().split(/\s+/).filter(Boolean).length;
  const durationPerStep = Math.max(6.5, Math.min(10, scriptWords ? scriptWords / 2.25 / replaySteps.length : 7.5));

  try {
    await writeFile(cursorPath, Buffer.from(cursorPngBase64, "base64"));
    for (const [index, step] of replaySteps.entries()) {
      if (!step.screenshotUrl) continue;
      const { buffer } = dataUrlToBuffer(step.screenshotUrl);
      const imagePath = path.join(tempDir, `screen-${index}.png`);
      const segmentPath = path.join(tempDir, `segment-${index}.mp4`);
      await writeFile(imagePath, buffer);
      const source = pngDimensions(buffer);
      const previousSource = index > 0 && replaySteps[index - 1]?.screenshotUrl
        ? pngDimensions(dataUrlToBuffer(replaySteps[index - 1].screenshotUrl).buffer)
        : source;
      const startCursor = index > 0 ? renderedCursor(replaySteps[index - 1], previousSource, index - 1, replaySteps.length) : { x: 640, y: 300 };
      const endCursor = renderedCursor(step, source, index, replaySteps.length);
      const text = ffmpegText(step.thought);
      const ghost = test.ghosts?.find((item) => item.id === step.ghostId);
      const ghostLabel = ffmpegText(ghost?.name || ghost?.label || `Ghost ${index + 1}`, 40);
      const cursorX = cursorExpression(startCursor, endCursor, "x", -32);
      const cursorY = cursorExpression(startCursor, endCursor, "y", -32);
      const filters = [
        "[0:v]scale=w=1120:h=500:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:28:color=0x030503,drawbox=x=0:y=0:w=1280:h=720:color=0x061009@0.2:t=fill[base]",
        `[base][1:v]overlay=x=${cursorX}:y=${cursorY}:eval=frame:format=auto[cursor]`,
        `[cursor]drawbox=x=54:y=538:w=1172:h=132:color=0x020402@0.86:t=fill,drawbox=x=54:y=538:w=1172:h=2:color=0x31d66b@0.9:t=fill,drawtext=fontfile='${font}':text='${ghostLabel} thinking aloud':x=82:y=560:fontsize=28:fontcolor=0x54f084,drawtext=fontfile='${font}':text='${text}':x=82:y=606:fontsize=24:fontcolor=0xf5fff6[v]`,
      ].join(";");
      await runCommand(ffmpeg, [
        "-y",
        "-loop",
        "1",
        "-i",
        imagePath,
        "-loop",
        "1",
        "-i",
        cursorPath,
        "-t",
        String(durationPerStep.toFixed(2)),
        "-filter_complex",
        filters,
        "-map",
        "[v]",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        segmentPath,
      ]);
      segments.push(segmentPath);
    }

    if (!segments.length) return null;
    const concatPath = path.join(tempDir, "concat.txt");
    await writeFile(concatPath, segments.map((segment) => `file '${segment.replace(/'/g, "'\\''")}'`).join("\n"));
    const silentVideoPath = path.join(tempDir, "silent.mp4");
    await runCommand(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", silentVideoPath]);

    const firstAudio = test.walkthroughAudioUrl || (test.reactions || []).map((reaction) => reaction.audioUrl).find(Boolean);
    const fileName = `${test.id}-ghost-replay.mp4`;
    const outputPath = path.join(videoDir, fileName);
    if (firstAudio) {
      const audioPath = path.join(publicDir, firstAudio.replace(/^\//, ""));
      await runCommand(ffmpeg, [
        "-y",
        "-i",
        silentVideoPath,
        "-i",
        audioPath,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        outputPath,
      ]);
    } else {
      await runCommand(ffmpeg, ["-y", "-i", silentVideoPath, "-c", "copy", "-movflags", "+faststart", outputPath]);
    }
    return `/generated/video/${fileName}`;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function schemaForAnalysis() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "productUnderstanding",
      "ghosts",
      "reactions",
      "rageQuitEvents",
      "frictionPoints",
      "rewriteSuggestions",
      "layoutSuggestions",
      "annotatedScreenshot",
      "codexPatch",
    ],
    properties: {
      productUnderstanding: { type: "object", additionalProperties: true },
      ghosts: { type: "array", items: { type: "object", additionalProperties: true } },
      reactions: { type: "array", items: { type: "object", additionalProperties: true } },
      rageQuitEvents: { type: "array", items: { type: "object", additionalProperties: true } },
      frictionPoints: { type: "array", items: { type: "object", additionalProperties: true } },
      rewriteSuggestions: { type: "array", items: { type: "object", additionalProperties: true } },
      layoutSuggestions: { type: "array", items: { type: "object", additionalProperties: true } },
      annotatedScreenshot: { type: "object", additionalProperties: true },
      codexPatch: { type: "object", additionalProperties: true },
    },
  };
}

async function callOpenAiAnalysis(test) {
  requireOpenAiKey();
  const ghostCount = Math.max(1, Math.min(3, Number(test.ghostCount || 3)));
  const websiteContext = await fetchWebsiteContext(test.websiteUrl);

  const prompt = `You are iGhost, an AI usability testing system. Simulate realistic synthetic users attempting a task on a product flow.

Stay grounded in screenshots and product context. Avoid generic UX advice. Every finding must include affected screenshot, affected ghost, task impact, concrete evidence, and a specific fix.

Return JSON matching this product shape:
- productUnderstanding
- exactly ${ghostCount} ghosts
- reactions for each ghost across the screenshots
- at least one plausible rageQuitEvent when a ghost fails
- frictionPoints
- rewriteSuggestions
- layoutSuggestions
- annotatedScreenshot with coordinates from 0 to 1
- codexPatch with a human-readable diff or implementation instructions.

Product name: ${test.productName}
Description: ${test.productDescription}
Target user: ${test.targetUser || "Not specified"}
Intended task: ${test.intendedTask}
Website URL: ${test.websiteUrl || "No URL provided"}
Website context: ${websiteContext || "No website context available."}
Code context: ${test.codeContext ? test.codeContext.slice(0, 6000) : "No code context provided."}
Screenshots in order: ${test.screenshots.length ? test.screenshots.map((screen, index) => `${index + 1}. ${screen.label || screen.id} ${screen.note || ""}`).join("\n") : "No screenshots provided. Use the website context and clearly note that visual findings are limited."}`;

  const content = [{ type: "input_text", text: prompt }];
  for (const screenshot of test.screenshots.slice(0, 5)) {
    content.push({ type: "input_image", image_url: screenshot.url, detail: "high" });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "ighost_analysis",
          strict: false,
          schema: schemaForAnalysis(),
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI analysis failed: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  const text = extractOutputText(json);
  if (!text) throw new Error("OpenAI analysis returned no text");
  return JSON.parse(text);
}

async function generateVoiceClip(test, reaction) {
  if (!process.env.OPENAI_API_KEY) return null;
  const voiceId = reaction.ghostId.endsWith("0") ? "verse" : "alloy";
  const narration = `${reaction.quote} ${reaction.wouldContinue ? "I would continue, but carefully." : "This is where I would stop."}`;
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: voiceId,
      input: narration.slice(0, 900),
      instructions: "Speak like a synthetic usability-test participant. Keep the delivery natural, concise, and emotionally grounded.",
      response_format: "mp3",
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const fileName = `${test.id}-${reaction.id}.mp3`;
  const filePath = path.join(audioDir, fileName);
  const stream = createWriteStream(filePath);
  await new Promise(async (resolve, reject) => {
    try {
      for await (const chunk of response.body) stream.write(chunk);
      stream.end(resolve);
    } catch (error) {
      reject(error);
    }
  });
  return `/generated/audio/${fileName}`;
}

async function generateWalkthroughVoice(test, ghost, steps) {
  requireOpenAiKey();
  const personaDirections = {
    impatient: "Mara is quick, a little impatient, direct, and practical. She notices delays fast and wants proof immediately.",
    unsure: "Nico is hesitant, warm, and uncertain. He asks small self-checking questions and wants reassurance before committing.",
    skeptical: "Ada is calm, sharp, and skeptical. She tests claims, looks for evidence, and sounds measured rather than harsh.",
  };
  const scriptPrompt = `Write the exact spoken voiceover for a recorded usability walkthrough.

This must sound like a real person thinking out loud while using the site, not like a report, not like captions, and not like someone reading bullet points.
Write for performance: include human pacing, small emotional turns, and screen-specific reactions the TTS model can act on.

Ghost:
${JSON.stringify({
  name: ghost.name,
  archetype: ghost.archetype,
  profile: test.ghostProfile,
  personality: personaDirections[test.ghostProfile] || ghost.context || test.customGhost?.profile,
}, null, 2)}

Website: ${test.websiteUrl || test.productName || "the website"}
User's instruction: ${test.intendedTask}

Observed actions and thoughts:
${steps.map((step, index) => `${index + 1}. Screen/action: ${step.actionLabel || step.action || "looking"} | internal thought: ${step.thought}`).join("\n")}

Output only the voiceover text.
Rules:
- First person present tense, as if the ghost is speaking live.
- No step numbers, no titles, no markdown, no stage directions.
- Use natural spoken rhythm with a few light pauses like "Okay," or "hmm" only when they fit.
- Refer to what the ghost is seeing and doing on screen.
- Match the ghost's personality: word choice, patience, skepticism, confidence, and emotional rhythm should feel distinct.
- Avoid polished narration. It should feel like a user forming opinions in the moment.
- Keep it between 75 and 120 words.`;

  const scriptResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      input: [{ role: "user", content: [{ type: "input_text", text: scriptPrompt }] }],
    }),
  });
  if (!scriptResponse.ok) throw new Error(await scriptResponse.text());
  const scriptJson = await scriptResponse.json();
  const script = extractOutputText(scriptJson).trim();
  if (!script) throw new Error("OpenAI did not return a voiceover script.");

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: ghost.voice || "alloy",
      input: script,
      instructions: `Performance direction: You are ${ghost.name}, ${ghost.archetype}. Speak like a real user in a live usability test, not a voice actor and not a narrator. Stay present-tense, conversational, and emotionally responsive to what is happening on screen. Vary pace naturally: pause briefly when scanning, speed up when something is obvious, slow down when confused, and let small reactions come through. Do not flatten the delivery. Do not overperform. ${ghost.voiceDirection || ghost.context || ""}`,
      response_format: "mp3",
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const fileName = `${test.id}-walkthrough.mp3`;
  const filePath = path.join(audioDir, fileName);
  const stream = createWriteStream(filePath);
  await new Promise(async (resolve, reject) => {
    try {
      for await (const chunk of response.body) stream.write(chunk);
      stream.end(resolve);
    } catch (error) {
      reject(error);
    }
  });
  return { url: `/generated/audio/${fileName}`, script };
}

async function generateActionableAdvice(test, ghost, steps) {
  requireOpenAiKey();
  const prompt = `You are a senior product designer reviewing a short usability walkthrough.

The user asked the ghost to do this:
${test.intendedTask}

Website:
${test.websiteUrl || test.productName || "Unknown"}

Ghost:
${JSON.stringify({ name: ghost.name, archetype: ghost.archetype, profile: test.ghostProfile }, null, 2)}

What the ghost did:
${steps.map((step, index) => `${index + 1}. ${step.actionLabel || step.action}: ${step.thought}`).join("\n")}

Return JSON only:
{
  "summary": "one sentence describing the main product/design issue",
  "items": [
    {
      "title": "short imperative recommendation",
      "why": "specific reason grounded in what the ghost tried to do",
      "change": "concrete UI/content change the site owner could make"
    }
  ]
}

Rules:
- Give 2 or 3 recommendations.
- Make the advice actionable, not a transcript.
- Tie every recommendation to the ghost's task and behavior.
- If the task was to find a price, recommend making the price more prominent if the ghost struggled to find it.
- Keep each field concise.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const json = await response.json();
  const advice = JSON.parse(cleanJsonText(extractOutputText(json)));
  return {
    summary: String(advice.summary || "Improve the page around the user's task.").trim(),
    items: Array.isArray(advice.items)
      ? advice.items.slice(0, 3).map((item) => ({
          title: String(item.title || "Clarify the next step").trim(),
          why: String(item.why || "").trim(),
          change: String(item.change || "").trim(),
        }))
      : [],
  };
}

function slugPart(value, fallback = "ghost-fix") {
  const slug = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
  return slug || fallback;
}

function buildCodexPatch(test, body = {}) {
  const repoUrl = String(body.repoUrl || process.env.IGHOST_REPO_URL || "https://github.com/Jo2234/iGhost").trim();
  const ghost = test.ghosts?.[0] || {};
  const advice = test.actionableAdvice || {};
  const adviceItems = Array.isArray(advice.items) ? advice.items.slice(0, 3) : [];
  const steps = Array.isArray(test.sessionSteps) ? test.sessionSteps.slice(0, 8) : [];
  const title = adviceItems[0]?.title || advice.summary || `Improve ${test.productName || "the product"} after ghost walkthrough`;
  const branchName = `codex/${slugPart(test.productName || "product")}-${slugPart(title)}`;
  const evidence = steps.length
    ? steps.map((step, index) => `${index + 1}. ${step.actionLabel || step.action || "Observed screen"}: ${step.thought}`).join("\n")
    : "Use the generated walkthrough video and actionable advice as the source of truth.";
  const recommendations = adviceItems.length
    ? adviceItems.map((item, index) => `${index + 1}. ${item.title}\n   Why: ${item.why}\n   Change: ${item.change}`).join("\n")
    : "No actionable advice was generated. Inspect the walkthrough and propose the smallest product change that helps the user complete the task.";
  const prompt = `You are Codex working on a product improvement from an iGhost usability walkthrough.

Repository: ${repoUrl}
Suggested branch: ${branchName}
Do not push directly to main. Create a branch, make the smallest useful change, run checks, commit, push the branch, and open a PR if GitHub access is available.

Product under test: ${test.productName || "Unknown product"}
Website: ${test.websiteUrl || "No website URL recorded"}
Ghost: ${ghost.name || "Ghost"}${ghost.archetype ? `, ${ghost.archetype}` : ""}
Ghost profile: ${test.customGhost?.profile || test.ghostProfile || "Default iGhost persona"}
Original user task: ${test.intendedTask}

Main finding:
${advice.summary || "The walkthrough found friction while the ghost tried to complete the task."}

Actionable recommendations:
${recommendations}

Evidence from the walkthrough:
${evidence}

Implementation guidance:
- Inspect the existing codebase before editing.
- Prefer the current design system and local patterns.
- Keep the change tightly scoped to the recommendation above.
- If the finding is about clarity, pricing, trust, navigation, or CTA visibility, improve the relevant UI/content rather than adding a generic explanation.
- Add or update tests/checks only where the repo already supports them or where the behavior is risky.
- Report the changed files, checks run, commit hash, pushed branch, and PR URL if created.`;

  return {
    id: id("patch"),
    testId: test.id,
    status: "ready",
    repoUrl,
    branchName,
    title,
    summary: advice.summary || "Codex patch request generated from ghost findings.",
    prompt,
    safetyNotes: [
      "Review the patch before merging.",
      "Do not include private screenshots, API keys, or local data in the PR.",
      "Push to a feature branch, not directly to main.",
    ],
    createdAt: new Date().toISOString(),
  };
}

function parseGitHubRepo(repoUrl) {
  const value = String(repoUrl || "").trim();
  const shorthand = value.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shorthand) return { owner: shorthand[1], repo: shorthand[2].replace(/\.git$/, "") };
  const parsed = new URL(value);
  if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
    throw new Error("Codex issue delivery currently supports GitHub repository URLs only.");
  }
  const [owner, repo] = parsed.pathname.replace(/^\/+/, "").split("/");
  if (!owner || !repo) throw new Error("GitHub repo URL must include an owner and repository name.");
  return { owner, repo: repo.replace(/\.git$/, "") };
}

function codexIssueBody(test, patch) {
  return `@codex Please implement this iGhost patch request.

This issue was generated from an iGhost walkthrough. Please create a feature branch, make the smallest useful change, run available checks, and open a pull request. Do not push directly to main.

## iGhost prompt

\`\`\`text
${patch.prompt}
\`\`\`

## Review notes

- Generated from test: ${test.id}
- Walkthrough video: ${test.videoUrl || "No video URL recorded"}
- Review the patch before merging.
- Do not include private screenshots, API keys, or local data in the PR.`;
}

async function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.IGHOST_GITHUB_TOKEN) return process.env.IGHOST_GITHUB_TOKEN;
  try {
    return await runCommandCapture("gh", ["auth", "token"], 8000);
  } catch {
    return "";
  }
}

async function createCodexIssue(test, patch) {
  const { owner, repo } = parseGitHubRepo(patch.repoUrl);
  const token = await githubToken();
  if (!token) {
    throw new Error("GitHub is not authenticated. Sign in with `gh auth login` locally or set GITHUB_TOKEN on the server.");
  }
  const title = `[iGhost] ${patch.title || patch.summary || "Codex patch request"}`.slice(0, 240);
  const body = codexIssueBody(test, patch);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "iGhost",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ title, body }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub issue creation failed: ${response.status} ${errorText}`);
  }
  const issue = await response.json();
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    apiUrl: issue.url,
    createdAt: issue.created_at,
  };
}

async function answerGhostQuestion(test, body) {
  requireOpenAiKey();
  const ghost = test.ghosts?.find((item) => item.id === body.ghostId) || test.ghosts?.[0];
  const reaction = test.reactions?.[Number(body.stepIndex || 0)] || test.reactions?.find((item) => item.ghostId === ghost?.id) || {};
  const screen = test.screenshots?.find((item) => item.id === reaction.screenshotId) || test.screenshots?.[0];
  if (!ghost) throw new Error("No ghost found for this test.");
  const prompt = `You are ${ghost.name}, one of iGhost's synthetic usability participants.

Stay inside this ghost's personality and answer the user's interruption as if you are currently looking at the product screen.

Ghost profile:
${JSON.stringify(ghost, null, 2)}

Current reaction:
${JSON.stringify(reaction, null, 2)}

Product task:
${test.intendedTask}

User interruption:
${body.question}

Answer in first person as the ghost. Be specific, grounded, concise, and mention what you would do next.`;

  const content = [{ type: "input_text", text: prompt }];
  if (screen?.url) content.push({ type: "input_image", image_url: screen.url, detail: "high" });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      input: [{ role: "user", content }],
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const json = await response.json();
  const text = extractOutputText(json);
  const followup = {
    id: id("followup"),
    ghostId: ghost.id,
    stepIndex: Number(body.stepIndex || 0),
    question: body.question,
    answer: text.trim(),
    createdAt: new Date().toISOString(),
  };
  return followup;
}

function normalizeAnalysis(test, analysis) {
  const merged = { ...analysis };
  const defaultScreens = test.screenshots.length ? test.screenshots : [{ id: "website", label: test.websiteUrl || "Website", url: "" }];
  const sourceGhosts = Array.isArray(merged.ghosts) && merged.ghosts.length ? merged.ghosts : defaultGhosts(test);
  merged.ghosts = sourceGhosts.slice(0, test.ghostCount || 3).map((ghost, index) => ({
    id: ghost.id || id("ghost"),
    testId: test.id,
    color: ghost.color || ["#ff8a5b", "#52d6c8", "#9b8cff"][index % 3],
    ...ghost,
  }));
  const ghostIds = new Set(merged.ghosts.map((ghost) => ghost.id));
  const sourceReactions = Array.isArray(merged.reactions) && merged.reactions.length
    ? merged.reactions
    : merged.ghosts.map((ghost, index) => ({
        ghostId: ghost.id,
        screenshotId: defaultScreens[0]?.id,
        stepOrder: 0,
        patienceBefore: ghost.patienceInitial || 70,
        patienceAfter: Math.max(25, (ghost.patienceInitial || 70) - 20),
        emotion: "curious",
        wouldContinue: true,
        quote: `I am starting on this page and trying to complete: ${test.intendedTask}`,
      }));
  merged.reactions = sourceReactions.map((reaction, index) => ({
    id: reaction.id || id("reaction"),
    testId: test.id,
    ghostId: ghostIds.has(reaction.ghostId) ? reaction.ghostId : merged.ghosts[index % merged.ghosts.length].id,
    screenshotId: reaction.screenshotId || defaultScreens[index % defaultScreens.length]?.id,
    stepOrder: Number.isFinite(reaction.stepOrder) ? reaction.stepOrder : index,
    patienceBefore: Number.isFinite(reaction.patienceBefore) ? reaction.patienceBefore : 70,
    patienceAfter: Number.isFinite(reaction.patienceAfter) ? reaction.patienceAfter : 45,
    emotion: reaction.emotion || "confused",
    wouldContinue: reaction.wouldContinue !== false,
    ...reaction,
  }));
  merged.rageQuitEvents = merged.rageQuitEvents || [];
  merged.frictionPoints = merged.frictionPoints || [];
  merged.rewriteSuggestions = merged.rewriteSuggestions || [];
  merged.layoutSuggestions = merged.layoutSuggestions || [];
  merged.codexPatch = merged.codexPatch || {
    id: id("patch"),
    testId: test.id,
    status: "not_requested",
    summary: "Request a Codex patch after reviewing the ghost findings.",
    filesChanged: [],
    instructions: "",
    safetyNotes: [],
  };
  return merged;
}

async function runTest(testId) {
  const db = await loadDb();
  const test = db.tests[testId];
  if (!test) return null;
  test.status = "analyzing";
  test.updatedAt = new Date().toISOString();
  await saveDb(db);

  try {
    requireOpenAiKey();
    const ghosts = defaultGhosts(test);
    const ghost = ghosts[0];
    const sessionSteps = await runLiveGhostSession(test, ghost);
    const reactions = sessionSteps.map((step) => ({
      id: id("reaction"),
      testId: test.id,
      ghostId: ghost.id,
      screenshotId: test.screenshots[0]?.id,
      stepOrder: step.stepOrder,
      quote: step.thought,
      emotion: step.action === "stop" ? "confused" : "curious",
      patienceBefore: Math.max(20, ghost.patienceInitial - step.stepOrder * 10),
      patienceAfter: Math.max(15, ghost.patienceInitial - (step.stepOrder + 1) * 10),
      wouldContinue: step.action !== "stop",
    }));
    const walkthroughVoice = await generateWalkthroughVoice(test, ghost, sessionSteps);
    const actionableAdvice = await generateActionableAdvice(test, ghost, sessionSteps);

    Object.assign(test, {
      ghosts,
      ghostIds: ghosts.map((item) => item.id),
      reactions,
      sessionSteps,
      walkthroughAudioUrl: walkthroughVoice.url,
      walkthroughScript: walkthroughVoice.script,
      actionableAdvice,
      frictionPoints: [],
      rewriteSuggestions: [],
      layoutSuggestions: [],
      codexPatch: null,
      status: "generating_assets",
      updatedAt: new Date().toISOString(),
      aiMode: "openai",
    });

    try {
      delete test.videoError;
      test.videoUrl = await generateReplayVideo(test);
    } catch (error) {
      delete test.videoUrl;
      test.videoError = error.message;
    }

    test.status = "complete";
    test.updatedAt = new Date().toISOString();
    if (!test.reportId) {
      const report = {
        id: id("report"),
        testId: test.id,
        publicSlug: safeSlug(test.productName),
        isPublic: true,
        title: `${test.productName || "Product"} ghost test`,
        summary: test.productUnderstanding?.flowSummary || "Synthetic usability report",
        createdAt: new Date().toISOString(),
      };
      db.reports[report.publicSlug] = report;
      test.reportId = report.id;
      test.reportSlug = report.publicSlug;
    }
  } catch (error) {
    Object.assign(test, {
      status: "failed",
      updatedAt: new Date().toISOString(),
      aiMode: "openai",
      generationError: error.message,
    });
  }

  await saveDb(db);
  return test;
}

async function handleApi(req, res, pathname) {
  if (req.method === "POST" && pathname === "/api/tests") {
    const body = await parseJsonBody(req);
    if (!process.env.OPENAI_API_KEY) {
      return send(res, 400, { error: "OPENAI_API_KEY is required. Add it to .env and restart the server." });
    }
    if (!body.intendedTask || (!body.websiteUrl && (!Array.isArray(body.screenshots) || !body.screenshots.length))) {
      return send(res, 400, { error: "Add a website URL or upload at least one screenshot, then tell the ghosts what to test." });
    }
    if (body.ghostProfile === "custom" && (!body.customGhost?.name || !body.customGhost?.profile)) {
      return send(res, 400, { error: "Add a name and profile for the custom ghost." });
    }
    const now = new Date().toISOString();
    const testId = id("test");
    let websiteUrl = "";
    try {
      websiteUrl = body.websiteUrl ? await validatePublicUrl(body.websiteUrl) : "";
    } catch (error) {
      return send(res, error.statusCode || 400, { error: error.message });
    }
    let screenshots;
    try {
      screenshots = await buildScreenshots({ ...body, websiteUrl }, testId);
    } catch (error) {
      return send(res, 502, { error: `Website capture failed: ${error.message}` });
    }
    const test = {
      id: testId,
      productName: body.productName || (websiteUrl ? new URL(websiteUrl).hostname.replace(/^www\./, "") : "Untitled product"),
      productDescription: body.productDescription || websiteUrl || "Product under test",
      targetUser: body.targetUser || "",
      intendedTask: body.intendedTask,
      websiteUrl,
      ghostCount: 1,
      ghostProfile: body.ghostProfile || "impatient",
      customGhost: body.ghostProfile === "custom" ? {
        name: String(body.customGhost?.name || "").trim().slice(0, 48),
        profile: String(body.customGhost?.profile || "").trim().slice(0, 800),
      } : null,
      codeContext: body.codeContext || "",
      status: "draft",
      createdAt: now,
      updatedAt: now,
      screenshots,
      screenshotIds: [],
      ghostIds: [],
    };
    test.screenshotIds = test.screenshots.map((screen) => screen.id);
    const db = await loadDb();
    db.tests[test.id] = test;
    await saveDb(db);
    return send(res, 201, { test });
  }

  const runMatch = pathname.match(/^\/api\/tests\/([^/]+)\/run$/);
  if (req.method === "POST" && runMatch) {
    const test = await runTest(runMatch[1]);
    if (!test) return send(res, 404, { error: "Test not found" });
    if (test.status === "failed") return send(res, 502, { error: test.generationError || "OpenAI analysis failed.", test });
    return send(res, 200, { test });
  }

  const askMatch = pathname.match(/^\/api\/tests\/([^/]+)\/ask$/);
  if (req.method === "POST" && askMatch) {
    const body = await parseJsonBody(req);
    if (!body.question) return send(res, 400, { error: "Question is required." });
    const db = await loadDb();
    const test = db.tests[askMatch[1]];
    if (!test) return send(res, 404, { error: "Test not found" });
    try {
      const followup = await answerGhostQuestion(test, body);
      test.followups = [...(test.followups || []), followup];
      test.updatedAt = new Date().toISOString();
      await saveDb(db);
      return send(res, 200, { followup, test });
    } catch (error) {
      return send(res, 502, { error: error.message });
    }
  }

  const patchMatch = pathname.match(/^\/api\/tests\/([^/]+)\/codex-patch$/);
  if (req.method === "POST" && patchMatch) {
    const body = await parseJsonBody(req);
    const db = await loadDb();
    const test = db.tests[patchMatch[1]];
    if (!test) return send(res, 404, { error: "Test not found" });
    if (test.status !== "complete") {
      return send(res, 409, { error: "Run the ghost walkthrough before requesting a Codex patch." });
    }
    const codexPatch = buildCodexPatch(test, body);
    test.codexPatch = codexPatch;
    test.updatedAt = new Date().toISOString();
    await saveDb(db);
    return send(res, 200, { codexPatch, test });
  }

  const sendPatchMatch = pathname.match(/^\/api\/tests\/([^/]+)\/codex-patch\/send$/);
  if (req.method === "POST" && sendPatchMatch) {
    const body = await parseJsonBody(req);
    const db = await loadDb();
    const test = db.tests[sendPatchMatch[1]];
    if (!test) return send(res, 404, { error: "Test not found" });
    if (test.status !== "complete") {
      return send(res, 409, { error: "Run the ghost walkthrough before sending a Codex issue." });
    }
    const codexPatch = test.codexPatch?.prompt ? test.codexPatch : buildCodexPatch(test, body);
    if (codexPatch.githubIssue?.url && !body.force) {
      return send(res, 200, { codexPatch, githubIssue: codexPatch.githubIssue, test });
    }
    try {
      const githubIssue = await createCodexIssue(test, codexPatch);
      test.codexPatch = {
        ...codexPatch,
        status: "sent_to_codex",
        githubIssue,
        sentAt: new Date().toISOString(),
      };
      test.updatedAt = new Date().toISOString();
      await saveDb(db);
      return send(res, 200, { codexPatch: test.codexPatch, githubIssue, test });
    } catch (error) {
      test.codexPatch = {
        ...codexPatch,
        status: "send_failed",
        sendError: error.message,
        updatedAt: new Date().toISOString(),
      };
      test.updatedAt = new Date().toISOString();
      await saveDb(db);
      return send(res, 502, { error: error.message, codexPatch: test.codexPatch, test });
    }
  }

  const testMatch = pathname.match(/^\/api\/tests\/([^/]+)$/);
  if (req.method === "GET" && testMatch) {
    const db = await loadDb();
    const test = db.tests[testMatch[1]];
    if (!test) return send(res, 404, { error: "Test not found" });
    return send(res, 200, { test });
  }

  const reportMatch = pathname.match(/^\/api\/reports\/([^/]+)$/);
  if (req.method === "GET" && reportMatch) {
    const db = await loadDb();
    const report = db.reports[reportMatch[1]];
    if (!report || !report.isPublic) return send(res, 404, { error: "Report not found" });
    const test = db.tests[report.testId];
    if (!test) return send(res, 404, { error: "Test not found" });
    const publicTest = { ...test, codeContext: "" };
    if (publicTest.codexPatch) {
      publicTest.codexPatch = { ...publicTest.codexPatch, safetyNotes: [...(publicTest.codexPatch.safetyNotes || []), "Private code context is excluded from public reports by default."] };
    }
    return send(res, 200, { report, test: publicTest });
  }

  return send(res, 404, { error: "API route not found" });
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
};

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = safePath.startsWith("/generated/")
    ? path.join(generatedDir, safePath.replace(/^\/generated\//, ""))
    : path.join(publicDir, safePath);
  try {
    const fileStat = await stat(filePath);
    const type = mime[path.extname(filePath)] || "application/octet-stream";
    if (path.extname(filePath) === ".mp4") {
      const range = req.headers.range;
      if (range) {
        const match = range.match(/bytes=(\d*)-(\d*)/);
        const start = match?.[1] ? Number(match[1]) : 0;
        const end = match?.[2] ? Math.min(Number(match[2]), fileStat.size - 1) : fileStat.size - 1;
        if (!match || start >= fileStat.size || end < start) {
          res.writeHead(416, { "content-range": `bytes */${fileStat.size}` });
          res.end();
          return;
        }
        res.writeHead(206, {
          "content-type": type,
          "content-length": end - start + 1,
          "content-range": `bytes ${start}-${end}/${fileStat.size}`,
          "accept-ranges": "bytes",
        });
        if (req.method === "HEAD") return res.end();
        createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, {
        "content-type": type,
        "content-length": fileStat.size,
        "accept-ranges": "bytes",
      });
      if (req.method === "HEAD") return res.end();
      createReadStream(filePath).pipe(res);
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": type, "content-length": body.length });
    if (req.method === "HEAD") return res.end();
    res.end(body);
  } catch {
    const index = await readFile(path.join(publicDir, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(index);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  try {
    if (url.pathname === "/health") {
      return send(res, 200, { status: "ok" });
    }
    if (url.pathname.startsWith("/api/")) {
      const limit = apiRateLimit(getClientIp(req));
      if (!limit.allowed) {
        return send(res, 429, { error: "Too many API requests. Please retry shortly." }, { "retry-after": String(limit.retryAfter) });
      }
      await handleApi(req, res, url.pathname);
    } else {
      await serveStatic(req, res, url.pathname);
    }
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return send(res, error.statusCode || 400, { error: error.message });
    }
    send(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`iGhost running at http://localhost:${PORT}`);
});
