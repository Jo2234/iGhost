import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generatedMediaPath } from "../lib/media.mjs";

test("generated-media URLs resolve under the configured directory and reject traversal", () => {
  assert.equal(generatedMediaPath("/data/generated", "/generated/audio/A-walkthrough.mp3"), "/data/generated/audio/A-walkthrough.mp3");
  for (const url of ["/generated/audio/../../secret", "/generated/audio/%2e%2e/secret", "https://example.test/A.mp3"]) assert.throws(() => generatedMediaPath("/data/generated", url));
});

const ffmpeg = [process.env.FFMPEG_PATH, "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg"].find(value => value && existsSync(value));

test("narrated MP4 generation reads audio from a custom generated directory", { skip: !ffmpeg, timeout: 60_000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ighost-media-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  process.env.IGHOST_DATA_DIR = path.join(directory, "data");
  process.env.IGHOST_GENERATED_DIR = path.join(directory, "separate-media-root");
  process.env.IGHOST_ACCESS_TOKEN = "synthetic-owner-token-not-a-real-secret";
  process.env.FFMPEG_PATH = ffmpeg;
  const { generateReplayVideo } = await import("../server.mjs");
  const image = path.join(directory, "frame.png");
  const audio = generatedMediaPath(process.env.IGHOST_GENERATED_DIR, "/generated/audio/synthetic.mp3");
  await mkdir(path.dirname(audio), { recursive: true });
  const encode = args => {
    const result = spawnSync(ffmpeg, ["-y", ...args], { encoding: "utf8", timeout: 15_000 });
    assert.equal(result.status, 0, result.stderr);
  };
  encode(["-f", "lavfi", "-i", "color=c=blue:s=640x360", "-frames:v", "1", image]);
  encode(["-f", "lavfi", "-i", "sine=frequency=440:duration=1", audio]);
  const video = await generateReplayVideo({
    id: "synthetic", ghosts: [], walkthroughAudioUrl: "/generated/audio/synthetic.mp3", walkthroughScript: "Synthetic spoken content",
    sessionSteps: [{ thought: "A synthetic screen", screenshotUrl: `data:image/png;base64,${(await readFile(image)).toString("base64")}` }],
  });
  const file = generatedMediaPath(process.env.IGHOST_GENERATED_DIR, video);
  assert.ok((await stat(file)).size > 0);
  const probe = spawnSync(ffmpeg, ["-i", file], { encoding: "utf8" });
  assert.match(probe.stderr, /Video: h264/);
  assert.match(probe.stderr, /Audio: aac/);
});
