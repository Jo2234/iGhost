import http from "node:http";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawn } from "node:child_process";

const root = process.cwd();
const publicDir = path.join(root, "public");
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");
const audioDir = path.join(publicDir, "generated", "audio");
const videoDir = path.join(publicDir, "generated", "video");

await mkdir(dataDir, { recursive: true });
await mkdir(audioDir, { recursive: true });
await mkdir(videoDir, { recursive: true });

await loadEnvFile();

const PORT = Number(process.env.PORT || 4173);
const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o";
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";

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

async function parseJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  return JSON.parse(raw);
}

function requireOpenAiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required. Add it to .env and restart the server.");
  }
}

function normalizeUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(withScheme);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Website URL must start with http or https.");
  }
  return parsed.toString();
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
  const browser = findBrowserExecutable();
  if (!browser) throw new Error("No supported browser found for live website session.");
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ighost-live-"));
  const port = 9300 + Math.floor(Math.random() * 600);
  const child = spawn(browser, [
    "--headless",
    "--disable-gpu",
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
    await cdp.send("Page.navigate", { url });
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
      return { index, tag: el.tagName.toLowerCase(), text, href: el.href || '', x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: rect.width > 4 && rect.height > 4 && style.visibility !== 'hidden' && style.display !== 'none' };
    }).filter(item => item.visible).slice(0, 30);
  })()`;
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true });
  return result.result?.value || [];
}

async function chooseGhostAction(test, ghost, step, screenshotUrl, elements) {
  const prompt = `You are controlling a browser as a synthetic usability participant.

Product/task: ${test.intendedTask}
Ghost/persona: ${JSON.stringify(ghost)}
Step: ${step}
Clickable elements: ${JSON.stringify(elements)}

Choose one next action that this ghost would actually take. Prefer realistic website actions: click a visible CTA, open a menu, scroll for more context, or stop if the task is blocked.

Return only JSON:
{"thought":"first-person thought while using the page","action":"click|scroll|stop","targetIndex":number|null,"reason":"short reason"}`;

  try {
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
    const text = json.output_text || json.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("") || "";
    const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    const target = elements.find((item) => /download|start|try|sign|get|learn/i.test(item.text)) || elements[0];
    return {
      thought: target ? `I see "${target.text || target.tag}" and I would try that next to understand the product.` : "I do not see an obvious next action, so I would scroll for context.",
      action: target ? "click" : "scroll",
      targetIndex: target?.index ?? null,
      reason: "Fallback action selection.",
    };
  }
}

async function performGhostAction(cdp, action, elements) {
  if (action.action === "scroll") {
    await cdp.send("Runtime.evaluate", { expression: "window.scrollBy({ top: Math.round(window.innerHeight * 0.75), behavior: 'instant' })" });
    await wait(1000);
    return { x: 1180, y: 620, label: "Scroll" };
  }
  if (action.action === "click") {
    const target = elements.find((item) => item.index === action.targetIndex) || elements[0];
    if (target) {
      const x = Math.max(1, Math.round(target.x + target.width / 2));
      const y = Math.max(1, Math.round(target.y + target.height / 2));
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
      const action = await chooseGhostAction(test, ghost, step, screenshotUrl, elements);
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
  const normalizedUrl = normalizeUrl(url);
  const browser = findBrowserExecutable();
  if (!browser) {
    throw new Error("No supported browser found for website capture. Install Chrome, Brave, Edge, or Chromium.");
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ighost-capture-"));
  const screenshotPath = path.join(tempDir, "capture.png");
  const args = [
    "--headless",
    "--disable-gpu",
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
    const response = await fetch(url, {
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
      `URL: ${url}`,
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
  const base = [
    {
      name: "Mara",
      archetype: "Impatient first-time user",
      goal: `Quickly decide whether ${test.productName} is worth trying.`,
      patienceInitial: 70,
      skepticism: 45,
      color: "#ff7a59",
    },
    {
      name: "Nico",
      archetype: "Unsure non-technical user",
      goal: "Understand the product without decoding jargon.",
      patienceInitial: 82,
      skepticism: 30,
      color: "#8b5cf6",
    },
    {
      name: "Ada",
      archetype: "Skeptical technical buyer",
      goal: "Look for proof, privacy, and workflow fit before trusting it.",
      patienceInitial: 68,
      skepticism: 80,
      color: "#45d6c5",
    },
  ];
  return base.slice(0, test.ghostCount || 3).map((ghost) => ({
    id: id("ghost"),
    testId: test.id,
    ...ghost,
  }));
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error("Expected a base64 data URL.");
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
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

function ffmpegText(value, maxLength = 110) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .slice(0, maxLength)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
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

async function generateReplayVideo(test) {
  if (!existsSync("/usr/local/bin/ffmpeg")) {
    throw new Error("ffmpeg is required to generate replay video.");
  }
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
  const segments = [];

  try {
    for (const [index, step] of replaySteps.entries()) {
      if (!step.screenshotUrl) continue;
      const { buffer } = dataUrlToBuffer(step.screenshotUrl);
      const imagePath = path.join(tempDir, `screen-${index}.png`);
      const segmentPath = path.join(tempDir, `segment-${index}.mp4`);
      await writeFile(imagePath, buffer);
      const point = step.cursor ? { x: step.cursor.x / 1440, y: step.cursor.y / 1100 } : pointForStep(index, replaySteps.length);
      const text = ffmpegText(step.thought);
      const ghost = test.ghosts?.find((item) => item.id === step.ghostId);
      const ghostLabel = ffmpegText(ghost?.name || ghost?.label || `Ghost ${index + 1}`, 40);
      const cursorX = Math.round(point.x * 1120) + 80;
      const cursorY = Math.round(point.y * 560) + 40;
      const filters = [
        "scale=1120:-2",
        "pad=1280:720:80:(720-ih)/2:color=0x07040d",
        "drawbox=x=0:y=0:w=1280:h=720:color=0x140a2e@0.18:t=fill",
        `drawbox=x=${cursorX - 20}:y=${cursorY - 20}:w=40:h=40:color=0xffffff@0.28:t=fill`,
        `drawbox=x=${cursorX - 6}:y=${cursorY - 6}:w=12:h=12:color=0xb08cff@0.95:t=fill`,
        "drawbox=x=54:y=538:w=1172:h=132:color=0x05030a@0.82:t=fill",
        `drawtext=fontfile='${font}':text='${ghostLabel} thinking aloud':x=82:y=560:fontsize=28:fontcolor=0xe9ddff`,
        `drawtext=fontfile='${font}':text='${text}':x=82:y=606:fontsize=24:fontcolor=0xffffff`,
      ].join(",");
      await runCommand("/usr/local/bin/ffmpeg", [
        "-y",
        "-loop",
        "1",
        "-i",
        imagePath,
        "-t",
        "4.5",
        "-vf",
        filters,
        "-r",
        "30",
        "-pix_fmt",
        "yuv420p",
        segmentPath,
      ]);
      segments.push(segmentPath);
    }

    if (!segments.length) return null;
    const concatPath = path.join(tempDir, "concat.txt");
    await writeFile(concatPath, segments.map((segment) => `file '${segment.replace(/'/g, "'\\''")}'`).join("\n"));
    const silentVideoPath = path.join(tempDir, "silent.mp4");
    await runCommand("/usr/local/bin/ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", silentVideoPath]);

    const firstAudio = (test.reactions || []).map((reaction) => reaction.audioUrl).find(Boolean);
    const fileName = `${test.id}-ghost-replay.mp4`;
    const outputPath = path.join(videoDir, fileName);
    if (firstAudio) {
      const audioPath = path.join(publicDir, firstAudio.replace(/^\//, ""));
      await runCommand("/usr/local/bin/ffmpeg", [
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
        "-shortest",
        outputPath,
      ]);
    } else {
      await runCommand("/usr/local/bin/ffmpeg", ["-y", "-i", silentVideoPath, "-c", "copy", outputPath]);
    }
    return `/generated/video/${fileName}`;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function fallbackAnalysis(test) {
  const screenshots = test.screenshots.length ? test.screenshots : [{ id: "screen_1", label: "Uploaded screen", order: 0 }];
  const ghosts = [
    {
      id: id("ghost"),
      testId: test.id,
      name: "Mara Quick",
      archetype: "Impatient first-time user",
      goal: `Finish "${test.intendedTask}" with as few decisions as possible.`,
      context: "Arrived from a shared link and will leave if the value is not obvious.",
      technicalLevel: "medium",
      patienceInitial: 72,
      skepticism: 45,
      caresAbout: ["clear next step", "fast proof of value", "plain language"],
      hates: ["vague CTAs", "signup before value", "long setup"],
      avatarState: "annoyed",
      color: "#ff8a5b",
    },
    {
      id: id("ghost"),
      testId: test.id,
      name: "Nico Fog",
      archetype: "Confused non-technical user",
      goal: `Understand what ${test.productName || "the product"} does before taking action.`,
      context: "Needs reassurance and concrete language before clicking.",
      technicalLevel: "low",
      patienceInitial: 82,
      skepticism: 28,
      caresAbout: ["examples", "gentle onboarding", "visible help"],
      hates: ["jargon", "dense forms", "ambiguous icons"],
      avatarState: "confused",
      color: "#52d6c8",
    },
    {
      id: id("ghost"),
      testId: test.id,
      name: "Ada Trace",
      archetype: "Skeptical technical user",
      goal: "Verify the claim, control data exposure, and see implementation credibility.",
      context: "Compares the product promise against evidence, privacy, and workflow fit.",
      technicalLevel: "high",
      patienceInitial: 68,
      skepticism: 78,
      caresAbout: ["specific proof", "privacy", "implementation detail"],
      hates: ["unsupported claims", "black boxes", "hidden costs"],
      avatarState: "skeptical",
      color: "#9b8cff",
    },
  ];

  const reactions = [];
  const rageQuitEvents = [];
  ghosts.forEach((ghost, ghostIndex) => {
    let patience = ghost.patienceInitial;
    screenshots.forEach((screen, stepIndex) => {
      if (rageQuitEvents.some((event) => event.ghostId === ghost.id)) return;
      const before = patience;
      const drop = ghostIndex === 0 ? 21 + stepIndex * 10 : ghostIndex === 1 ? 14 + stepIndex * 8 : 17 + stepIndex * 7;
      patience = clamp(patience - drop);
      const label = screen.label || `Screenshot ${stepIndex + 1}`;
      const confusion =
        stepIndex === 0
          ? [`The screen does not immediately prove how it helps ${test.targetUser || "the target user"}.`]
          : ["The previous step does not make this next action feel inevitable."];
      const wouldContinue = patience > (ghostIndex === 0 ? 34 : 24) && stepIndex < screenshots.length - 1;
      const emotion = !wouldContinue && patience <= 34 ? "rage_quit" : patience < 45 ? "annoyed" : ghostIndex === 2 ? "skeptical" : "confused";
      const quote = !wouldContinue && patience <= 34
        ? `I still do not know why this is worth my next click, so I am out at ${label}.`
        : `I can guess the next move on ${label}, but I need a more concrete reason to trust it.`;

      reactions.push({
        id: id("reaction"),
        testId: test.id,
        ghostId: ghost.id,
        screenshotId: screen.id,
        stepOrder: stepIndex,
        noticedFirst: stepIndex === 0 ? "The headline and primary call to action" : "The main form or next-step control",
        interpretation: `${ghost.name} thinks the product wants them to ${test.intendedTask || "continue"}, but the benefit is not explicit enough.`,
        confusion,
        trustIssues: ghostIndex === 2 ? ["The screen needs stronger proof, privacy context, or a concrete example."] : [],
        expectedNextAction: "Click the clearest primary action after understanding the value.",
        actualLikelyAction: wouldContinue ? "Hesitate, scan, then continue." : "Stop the flow and look for a clearer alternative.",
        quote,
        patienceBefore: before,
        patienceAfter: patience,
        emotion,
        wouldContinue,
      });

      if (!wouldContinue && patience <= 34) {
        rageQuitEvents.push({
          id: id("rage"),
          testId: test.id,
          ghostId: ghost.id,
          screenshotId: screen.id,
          stepOrder: stepIndex,
          reason: "The screen asks for attention before proving value.",
          exactTrigger: stepIndex === 0 ? "Vague first impression and unclear CTA promise" : "Commitment appears before enough context is earned",
          userThought: quote,
          severity: ghostIndex === 0 ? "critical" : "high",
          replayNarration: `${ghost.name} loses patience on ${label}: ${quote}`,
        });
      }
    });
  });

  const firstScreen = screenshots[0];
  const frictionPoints = [
    {
      id: id("friction"),
      testId: test.id,
      title: "The first screen does not make the task payoff concrete",
      description: `Ghosts can see a path forward, but they cannot quickly explain why ${test.productName || "the product"} is worth using for "${test.intendedTask}".`,
      evidence: `On ${firstScreen.label || "Screenshot 1"}, reactions mention the headline/CTA before they mention a concrete outcome.`,
      affectedGhostIds: ghosts.map((ghost) => ghost.id),
      affectedScreenshotIds: [firstScreen.id],
      severity: "critical",
      recommendedFix: "Rewrite the headline and CTA around the user's task outcome, then add one proof point directly below.",
    },
    {
      id: id("friction"),
      testId: test.id,
      title: "The flow needs stronger continuity between steps",
      description: "Later screens do not clearly answer what changed, what was saved, or why the next step matters.",
      evidence: screenshots.length > 1 ? `The transition into ${screenshots[1].label || "Screenshot 2"} creates hesitation.` : "The uploaded screen has no supporting flow context.",
      affectedGhostIds: ghosts.slice(0, 2).map((ghost) => ghost.id),
      affectedScreenshotIds: screenshots.slice(1, 2).map((screen) => screen.id),
      severity: screenshots.length > 1 ? "high" : "medium",
      recommendedFix: "Add a short step label or progress hint that explains what the user just completed and what happens next.",
    },
    {
      id: id("friction"),
      testId: test.id,
      title: "Trust evidence arrives too late",
      description: "The skeptical ghost needs privacy, proof, or an example before committing code, screenshots, or personal data.",
      evidence: "Ada Trace flags a lack of evidence and privacy framing.",
      affectedGhostIds: [ghosts[2].id],
      affectedScreenshotIds: [firstScreen.id],
      severity: "high",
      recommendedFix: "Place a compact trust strip near the CTA: what is analyzed, what is private, and an example output.",
    },
  ];

  return {
    productUnderstanding: {
      testId: test.id,
      inferredProductType: "Task-focused product flow",
      inferredPrimaryUser: test.targetUser || "First-time evaluator",
      inferredUserGoal: test.intendedTask,
      primaryCTA: "Primary action needs clarification",
      keyUIElements: screenshots.map((screen) => ({
        screenshotId: screen.id,
        elements: ["headline", "primary CTA", "supporting copy", "navigation or form controls"],
      })),
      flowSummary: `${test.productName || "This product"} should help ${test.targetUser || "users"} complete "${test.intendedTask}", but the flow needs stronger evidence and step-to-step clarity.`,
      uncertaintyNotes: ["Fallback analysis was used because OpenAI generation was unavailable or failed."],
    },
    ghosts,
    reactions,
    rageQuitEvents,
    frictionPoints,
    rewriteSuggestions: [
      {
        id: id("rewrite"),
        testId: test.id,
        type: "headline",
        before: test.productDescription || "A broad product description",
        after: `Help ${test.targetUser || "new users"} ${lowerFirst(test.intendedTask || "complete the key task")} without guessing what to click next.`,
        rationale: "Names the audience, outcome, and clarity promise instead of relying on broad positioning.",
        affectedFrictionPointIds: [frictionPoints[0].id],
      },
      {
        id: id("rewrite"),
        testId: test.id,
        type: "cta",
        before: "Get started",
        after: `Run the ${test.intendedTask ? "task" : "flow"} check`,
        rationale: "The CTA says what will happen next and lowers commitment anxiety.",
        affectedFrictionPointIds: [frictionPoints[0].id],
      },
      {
        id: id("rewrite"),
        testId: test.id,
        type: "subheadline",
        before: "Everything you need in one place",
        after: "Upload the flow, watch synthetic users react, then copy the top fixes.",
        rationale: "Turns a generic benefit into a concrete three-step promise.",
        affectedFrictionPointIds: [frictionPoints[1].id],
      },
    ],
    layoutSuggestions: [
      {
        id: id("layout"),
        testId: test.id,
        screenshotId: firstScreen.id,
        issue: "Primary value and primary action are visually separated from proof.",
        suggestion: "Group headline, task-specific CTA, and a one-line proof statement in the first scan area.",
        rationale: "This helps impatient and skeptical ghosts decide whether continuing is worth it.",
        priority: "high",
      },
      {
        id: id("layout"),
        testId: test.id,
        screenshotId: firstScreen.id,
        issue: "The next step is not explicit enough.",
        suggestion: "Add a small step indicator or helper line under the CTA explaining what happens after the click.",
        rationale: "Nico needs a low-risk explanation before moving forward.",
        priority: "medium",
      },
    ],
    annotatedScreenshot: {
      id: id("annotation"),
      testId: test.id,
      screenshotId: firstScreen.id,
      imageUrl: firstScreen.url,
      annotations: [
        {
          x: 0.12,
          y: 0.16,
          width: 0.5,
          height: 0.18,
          label: "Make payoff specific",
          severity: "critical",
          explanation: "The first scan should answer who this helps and what result they get.",
        },
        {
          x: 0.18,
          y: 0.42,
          width: 0.26,
          height: 0.12,
          label: "Clarify next action",
          severity: "high",
          explanation: "The CTA should say whether this starts a demo, upload, signup, or analysis.",
        },
      ],
    },
    codexPatch: {
      id: id("patch"),
      testId: test.id,
      status: "ready",
      summary: "Approximate patch for the highest-priority copy and trust issues.",
      filesChanged: [
        {
          path: "app/page.tsx",
          changeSummary: "Rewrite hero copy, CTA, and trust strip.",
          diff: `--- a/app/page.tsx\n+++ b/app/page.tsx\n@@\n- <h1>${test.productDescription || "Everything you need in one place"}</h1>\n- <button>Get started</button>\n+ <h1>Help ${test.targetUser || "new users"} ${lowerFirst(test.intendedTask || "complete the key task")} without guessing what to click next.</h1>\n+ <button>Run the flow check</button>\n+ <p>No public sharing by default. See findings before you commit.</p>`,
        },
      ],
      instructions: "Apply the copy changes in the first viewport, then place the trust line within the same scan area as the CTA.",
      safetyNotes: ["Generated without direct code context unless you pasted code into the test."],
    },
  };
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
  const text = json.output_text || json.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("");
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
  const text = json.output_text || json.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("") || "";
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
    const openAiResult = await callOpenAiAnalysis(test);
    const analysis = normalizeAnalysis(test, openAiResult);
    Object.assign(test, analysis, {
      ghostIds: analysis.ghosts.map((ghost) => ghost.id),
      status: "generating_assets",
      updatedAt: new Date().toISOString(),
      aiMode: "openai",
    });

    if (process.env.OPENAI_API_KEY) {
      const keyReactions = test.ghosts.map((ghost) => test.reactions.find((reaction) => reaction.ghostId === ghost.id)).filter(Boolean);
      for (const reaction of keyReactions) {
        try {
          reaction.audioUrl = await generateVoiceClip(test, reaction);
        } catch (error) {
          reaction.audioError = error.message;
        }
      }
    }

    if (test.websiteUrl && test.ghosts?.[0]) {
      try {
        test.sessionSteps = await runLiveGhostSession(test, test.ghosts[0]);
      } catch (error) {
        test.sessionError = error.message;
      }
    }

    try {
      test.videoUrl = await generateReplayVideo(test);
    } catch (error) {
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
    const body = await parseJson(req);
    if (!process.env.OPENAI_API_KEY) {
      return send(res, 400, { error: "OPENAI_API_KEY is required. Add it to .env and restart the server." });
    }
    if (!body.intendedTask || (!body.websiteUrl && (!Array.isArray(body.screenshots) || !body.screenshots.length))) {
      return send(res, 400, { error: "Add a website URL or upload at least one screenshot, then tell the ghosts what to test." });
    }
    const now = new Date().toISOString();
    const testId = id("test");
    const websiteUrl = body.websiteUrl ? normalizeUrl(body.websiteUrl) : "";
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
      ghostCount: Math.max(1, Math.min(3, Number(body.ghostCount || 3))),
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
    const body = await parseJson(req);
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
};

async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": mime[path.extname(filePath)] || "application/octet-stream" });
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
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
    } else {
      await serveStatic(res, url.pathname);
    }
  } catch (error) {
    send(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`iGhost running at http://localhost:${PORT}`);
});
