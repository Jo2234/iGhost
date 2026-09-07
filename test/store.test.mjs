import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store, singleFlight } from "../lib/store.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ighost-store-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new Store(directory);
}

test("migration preserves original db, records, report links and resumes safely", async t => {
  const store = await fixture(t);
  const original = JSON.stringify({ tests: { A: { id: "A", reportSlug: "public-report" } }, reports: { "public-report": { testId: "A", isPublic: true } } });
  await writeFile(path.join(store.directory, "db.json"), original);
  await store.initialize();
  assert.equal((await store.get("tests", "A")).reportSlug, "public-report");
  assert.equal((await store.get("reports", "public-report")).testId, "A");
  await store.update("tests", "A", value => ({ ...value, newer: true }));
  await rm(path.join(store.directory, "records-v1.json"));
  await store.initialize();
  assert.equal((await store.get("tests", "A")).newer, true);
  assert.equal(await readFile(path.join(store.directory, "db.json"), "utf8"), original);
});

test("concurrent record updates never lose sibling records or appended followups", async t => {
  const store = await fixture(t);
  await store.initialize();
  await store.create("tests", "A", { id: "A", followups: [] });
  await Promise.all([
    store.create("tests", "B", { id: "B" }),
    ...Array.from({ length: 30 }, (_, index) => store.update("tests", "A", value => ({ ...value, followups: [...value.followups, index] }))),
  ]);
  assert.equal((await store.get("tests", "A")).followups.length, 30);
  assert.equal((await store.get("tests", "B")).id, "B");
  assert.deepEqual((await readdir(path.join(store.directory, "tests"))).sort(), ["A.json", "B.json"]);
});

test("corrupt records and migration fail loudly without resetting data", async t => {
  const store = await fixture(t);
  await writeFile(path.join(store.directory, "db.json"), "{broken");
  await assert.rejects(store.initialize(), /Cannot migrate/);
  await writeFile(path.join(store.directory, "db.json"), "null");
  await assert.rejects(store.initialize(), /Cannot migrate/);
  await writeFile(path.join(store.directory, "db.json"), '{"tests":[],"reports":{}}');
  await assert.rejects(store.initialize(), /Cannot migrate/);
  await rm(path.join(store.directory, "db.json"));
  await store.initialize();
  await writeFile(store.file("tests", "A"), "{broken");
  await assert.rejects(store.update("tests", "A", () => ({ lost: true })));
  assert.equal(await readFile(store.file("tests", "A"), "utf8"), "{broken");
  await writeFile(store.file("tests", "A"), "null");
  await assert.rejects(store.get("tests", "A"), /Invalid tests record/);
  await store.create("tests", "B", { id: "B" });
  assert.equal((await store.get("tests", "B")).id, "B");
});

test("single flight joins running work and allows retry after failure", async () => {
  const run = singleFlight();
  let calls = 0, release;
  const paused = new Promise(resolve => { release = resolve; });
  const task = () => { calls++; return paused; };
  const first = run("A", task), second = run("A", task);
  assert.equal(first, second);
  release("done");
  assert.equal(await first, "done");
  assert.equal(calls, 1);
  await assert.rejects(run("A", () => { throw new Error("failed"); }));
  assert.equal(await run("A", () => "retried"), "retried");
});
