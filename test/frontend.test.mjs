import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const frontend = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("send UI waits for confirmed delivery and restores the action on failure", async () => {
  for (const failure of [false, true]) {
    const callbacks = {}, messages = [], requests = [];
    const elements = Object.fromEntries(["#codex-request", "#codex-copy", "#codex-send"].map(key => [key, { addEventListener: (_, callback) => { callbacks[key] = callback; } }]));
    let finish, rendered;
    const pending = new Promise((resolve, reject) => { finish = failure ? () => reject(new Error("Delivery failed")) : () => resolve({ test: { id: "A" }, githubIssue: { number: 7, url: "https://github.com/example/project/issues/7" } }); });
    const context = vm.createContext({ app: { querySelector: key => elements[key] }, api: (...args) => { requests.push(args); return pending; }, setCodexStatus: message => messages.push(message), output: value => { rendered = value; } });
    vm.runInContext(frontend.slice(frontend.indexOf("function bindCodexPatch"), frontend.indexOf("function signIn")), context);
    context.bindCodexPatch({ id: "A" });
    const click = callbacks["#codex-send"]();
    assert.equal(elements["#codex-send"].disabled, true);
    assert.equal(requests[0][0], "/api/tests/A/codex-patch/send");
    assert.equal(messages.some(value => value.includes("Created")), false);
    finish();
    await click;
    if (failure) {
      assert.equal(elements["#codex-send"].disabled, false);
      assert.equal(messages.at(-1), "Delivery failed");
      assert.equal(rendered, undefined);
    } else {
      assert.equal(rendered.id, "A");
      assert.match(messages.at(-1), /Created GitHub issue #7/);
    }
  }
});
