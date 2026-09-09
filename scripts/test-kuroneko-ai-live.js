"use strict";

const { PUBLIC_PROVIDER_IDS, PROVIDERS, invokeProvider } = require("../lib/kuroneko-multiai");

if (process.env.KURONEKO_LIVE_TEST !== "1") {
  console.log("KuroNeko live contract test skipped (set KURONEKO_LIVE_TEST=1 explicitly)." );
  process.exit(0);
}
if (!String(process.env.KURONEKO_API_KEY || "").trim()) {
  console.error("KURONEKO_API_KEY is required for the opt-in live contract test.");
  process.exit(1);
}

const image = process.env.KURONEKO_TEST_IMAGE_URL || "https://placeholdr.dev/512x512.png";
function sample(provider) {
  const input = {};
  for (const field of provider.fields) {
    if (field.name === "url" || field.name === "image") input[field.name] = image;
    else if (field.name === "q" || field.name === "query" || field.name === "prompt") input[field.name] = provider.category === "image" ? "a calm blue sky, minimal" : "Hello";
    else if (field.name === "text") input[field.name] = "Hello from Nexora";
    else if (field.name === "model" && field.required) input[field.name] = field.defaultValue || "miku";
  }
  return input;
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

(async () => {
  let failed = 0;
  for (const id of PUBLIC_PROVIDER_IDS) {
    const provider = PROVIDERS[id];
    const started = Date.now();
    try {
      const result = await invokeProvider(id, sample(provider));
      console.log(JSON.stringify({ provider: id, ok: true, kind: result.kind, latencyMs: result.latencyMs }));
    } catch (error) {
      failed += 1;
      console.log(JSON.stringify({ provider: id, ok: false, code: error.code || "FAILED", latencyMs: Date.now() - started }));
    }
    await wait(1300);
  }
  if (failed) process.exitCode = 1;
})().catch((error) => { console.error(error.code || "LIVE_TEST_FAILED"); process.exitCode = 1; });
