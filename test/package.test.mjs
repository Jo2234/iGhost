import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";

test("the Docker COPY manifest contains a bootable server package", { timeout: 15_000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ighost-package-test-"));
  const root = new URL("../", import.meta.url);
  const dockerfile = await readFile(new URL("Dockerfile", root), "utf8");
  for (const match of dockerfile.matchAll(/^COPY (\S+) (\S+)$/gm)) {
    await cp(new URL(match[1], root), path.join(directory, match[2] === "./" ? match[1] : match[2]), { recursive: true });
  }
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: directory, env: { PATH: process.env.PATH, PORT: "0", IGHOST_ACCESS_TOKEN: "synthetic-owner-token-for-package-test", IGHOST_DATA_DIR: path.join(directory, "data"), IGHOST_GENERATED_DIR: path.join(directory, "media") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => { child.kill(); await new Promise(resolve => child.exitCode !== null || child.signalCode ? resolve() : child.once("close", resolve)); await rm(directory, { recursive: true, force: true }); });
  let diagnostics = "";
  child.stderr.on("data", chunk => { diagnostics += chunk; });
  const message = await new Promise((resolve, reject) => {
    child.stdout.once("data", chunk => resolve(String(chunk)));
    child.once("error", reject);
    child.once("exit", code => reject(new Error(`Package exited ${code}: ${diagnostics}`)));
  });
  const url = message.match(/http:\/\/[^\s]+/)?.[0];
  assert.ok(url, "server must expose its bound address");
  const status = await new Promise((resolve, reject) => { http.get(`${url}/health`, res => { res.resume(); resolve(res.statusCode); }).on("error", reject); });
  assert.equal(status, 200);
});
