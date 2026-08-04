const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function main() {
  let retryCalls = 0;
  const events = [];
  const sandbox = {
    window: {},
    document: { dispatchEvent(event) { events.push(event); } },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    AbortController,
    FormData,
    setTimeout,
    clearTimeout,
    Promise,
    Error
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("hang")) {
      return new Promise((resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    }
    retryCalls += 1;
    if (retryCalls === 1) return { status: 503, ok: false, body: { async cancel() {} } };
    return { status: 200, ok: true, body: null };
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/core/network.js"), "utf8"), sandbox, { filename: "network.js" });

  const response = await sandbox.window.NexoraFetch("https://example.com/retry", { nexoraTimeoutMs: 1000 });
  assert.equal(response.status, 200);
  assert.equal(retryCalls, 2, "GET 503 harus dicoba ulang satu kali");

  await assert.rejects(
    sandbox.window.NexoraFetch("https://example.com/hang", { nexoraTimeoutMs: 20, nexoraRetries: 0 }),
    (error) => error.code === "REQUEST_TIMEOUT"
  );
  assert.ok(events.some((event) => event.type === "nexora:network-error" && event.detail?.reason === "TIMEOUT"));
  assert.equal(typeof sandbox.window.NexoraFetchJson, "function");
  console.log("Network v6.2 tests lulus: timeout, retry GET, dan event error valid.");
}

main().catch((error) => { console.error(error); process.exit(1); });
