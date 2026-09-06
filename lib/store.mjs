import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const validKey = key => typeof key === "string" && /^[a-zA-Z0-9_-]+$/.test(key);
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

export class Store {
  constructor(directory) {
    this.directory = directory;
    this.queue = Promise.resolve();
  }

  file(kind, key) {
    if (!["tests", "reports"].includes(kind) || !validKey(key)) throw new Error("Invalid record identifier.");
    return path.join(this.directory, kind, `${key}.json`);
  }

  async initialize() {
    for (const kind of ["tests", "reports"]) await mkdir(path.join(this.directory, kind), { recursive: true });
    const marker = path.join(this.directory, "records-v1.json");
    try {
      const version = JSON.parse(await readFile(marker, "utf8"));
      if (version?.version !== 1) throw new Error("Unsupported record-store version.");
      return;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    let legacy;
    try { legacy = JSON.parse(await readFile(path.join(this.directory, "db.json"), "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw new Error(`Cannot migrate db.json: ${error.message}`); }
    if (legacy !== undefined) {
      if (!isRecord(legacy) || !isRecord(legacy.tests) || !isRecord(legacy.reports)) throw new Error("Cannot migrate invalid db.json structure.");
      // Keep the original file untouched as the migration backup. A partial
      // migration can resume without replacing already migrated/updated records.
      for (const kind of ["tests", "reports"]) {
        for (const [key, value] of Object.entries(legacy[kind])) {
          if (!isRecord(value)) throw new Error(`Cannot migrate invalid ${kind} record: ${key}`);
          if (await this.get(kind, key) === null) await this.atomicWrite(this.file(kind, key), value);
        }
      }
    }
    await this.atomicWrite(marker, { version: 1, migratedAt: new Date().toISOString() });
  }

  async get(kind, key) {
    if (!validKey(key)) return null;
    try {
      const value = JSON.parse(await readFile(this.file(kind, key), "utf8"));
      if (!isRecord(value)) throw new Error(`Invalid ${kind} record: ${key}`);
      return value;
    }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }

  async atomicWrite(file, value) {
    const temporary = `${file}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
      await rename(temporary, file);
    } finally { await rm(temporary, { force: true }); }
  }

  // Mutators run inside one short write queue, always against the latest record.
  // Long-running browser/API work must happen outside this callback.
  update(kind, key, mutate) {
    const operation = this.queue.then(async () => {
      const next = mutate(await this.get(kind, key));
      if (next === null) return null;
      if (!isRecord(next) || typeof next.then === "function") throw new Error("Record mutator must return an object synchronously.");
      await this.atomicWrite(this.file(kind, key), next);
      return next;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  create(kind, key, value) {
    return this.update(kind, key, current => {
      if (current) throw new Error("Record already exists.");
      return value;
    });
  }
}

export function singleFlight() {
  const active = new Map();
  return (key, operation) => {
    if (active.has(key)) return active.get(key);
    const result = Promise.resolve().then(operation).finally(() => active.delete(key));
    active.set(key, result);
    return result;
  };
}
