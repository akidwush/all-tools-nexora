"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { DEFAULT_MODEL, generateGeminiReply, normalizeSettings } = require("../lib/personal-ai");

async function main() {
  assert.equal(DEFAULT_MODEL, "gemini-2.5-flash");

  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const attempted = [];
  try {
    const result = await generateGeminiReply({
      settings: normalizeSettings({ model: "gemini-3.6-flash" }),
      message: "uji",
      timeoutMs: 2_000,
      clientFactory: async () => ({
        models: {
          generateContent: async ({ model }) => {
            attempted.push(model);
            if (model === "gemini-3.6-flash") {
              throw Object.assign(new Error("model is not found for this API version"), { status: 404 });
            }
            return { text: "OK" };
          }
        }
      })
    });
    assert.deepEqual(attempted, ["gemini-3.6-flash", "gemini-2.5-flash"]);
    assert.deepEqual(result, { text: "OK", model: "gemini-2.5-flash" });
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }

  const app = read("assets/js/core/app.js");
  const database = read("lib/public-database.js");
  const core = read("assets/css/core.css");
  const components = read("assets/css/components.css");
  const svgAlight = read("assets/js/features/svg-alight.js");
  const downloader = read("lib/downloader-service.js");

  assert.match(database, /sort_order,is_active,metadata/);
  assert.doesNotMatch(database, /tools\?[^"\n]*is_active=eq\.true/);
  assert.match(app, /for \(const base of baseById\.values\(\)\)/);
  assert.match(app, /if \(row\?\.is_active === false\) continue/);
  assert.doesNotMatch(app, /const requiredLocalIds = \['alightpremium'\]/);

  assert.match(core, /backdrop-filter:blur\(17px\) saturate\(138%\)/);
  assert.match(core, /backdrop-filter:blur\(10px\) saturate\(122%\)/);
  assert.match(core, /@media \(max-width:767px\)\{[\s\S]*?\.tools-card\{[\s\S]*?backdrop-filter:none!important/);
  assert.doesNotMatch(components, /@media\(min-width:320px\) and \(max-width:767px\)[\s\S]*?\.tools-grid/);

  assert.match(svgAlight, /API READY/);
  assert.match(svgAlight, /Konversi melewati batas waktu 35 detik/);
  assert.match(downloader, /Probe the API contract first/);
  assert.match(downloader, /source\.endpoint\(config\.healthInput, \{\}\)/);

  console.log("HF13 stabilization lulus: katalog merge, glass depth, AI fallback, downloader health, dan SVG timeout tervalidasi.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
