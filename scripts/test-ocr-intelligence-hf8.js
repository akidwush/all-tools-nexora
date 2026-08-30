const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  MAX_FILE_BYTES,
  callOcrSpace,
  decodeFile,
  detectLanguage,
  documentStats,
  normalizeOptions,
  processDocument,
  resetOcrIntelligenceState
} = require("../lib/ocr-intelligence");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function dataUrl(buffer, mime = "image/png") {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function responseCapture() {
  const captured = { headers: {} };
  return {
    captured,
    response: {
      setHeader(name, value) { captured.headers[name] = value; },
      status(code) { captured.status = code; return this; },
      json(payload) { captured.payload = payload; return payload; },
      end() { captured.ended = true; }
    }
  };
}

function assertBalancedCss(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
  let depth = 0;
  for (const character of clean) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    assert.ok(depth >= 0, "CSS OCR menutup blok terlalu awal");
  }
  assert.equal(depth, 0, "CSS OCR memiliki blok yang tidak seimbang");
}

async function main() {
  resetOcrIntelligenceState();

  const decoded = decodeFile({ fileData: dataUrl(png), fileName: "Screenshot Nexora.png" });
  assert.equal(decoded.mime, "image/png");
  assert.equal(decoded.filetype, "PNG");
  assert.equal(decoded.buffer.length, png.length);
  assert.throws(() => decodeFile({ fileData: "data:image/png;base64,not_valid***", fileName: "x.png" }), (error) => error.code === "OCR_FILE_INVALID");
  assert.throws(() => decodeFile({ fileData: dataUrl(Buffer.alloc(MAX_FILE_BYTES + 1)), fileName: "large.png" }), (error) => error.code === "OCR_FILE_TOO_LARGE");

  assert.deepEqual(normalizeOptions({ engine: 2, language: "auto" }), { engine: 2, language: "auto", searchablePdf: true, hideTextLayer: true, tableMode: false, scale: true });
  assert.equal(normalizeOptions({ engine: 1, language: "auto", searchablePdf: false }).language, "eng");
  assert.throws(() => normalizeOptions({ engine: 3, searchablePdf: true }), (error) => error.code === "OCR_ENGINE_3_PDF_UNSUPPORTED");

  assert.equal(detectLanguage("Ini adalah dokumen yang akan dianalisis dengan sistem Nexora dan hasilnya untuk pengguna.").code, "id");
  assert.equal(detectLanguage("The document is ready and this result will be available for you with the report.").code, "en");
  assert.equal(detectLanguage("これは日本語のテキストです").code, "ja");
  const stats = documentStats("Nexora membaca dokumen. Nexora membuat teks dapat dicari.\n\nBaris kedua 2026.", 2);
  assert.equal(stats.pages, 2);
  assert.ok(stats.words >= 9);
  assert.ok(stats.topKeywords.some((item) => item.word === "nexora" && item.count === 2));

  let providerCalls = 0;
  const fetchImpl = async (input, options) => {
    providerCalls += 1;
    assert.equal(String(input), "https://api.ocr.space/parse/image");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.apikey, "OCR_TEST_SECRET");
    assert.equal(options.body.get("OCREngine"), "2");
    assert.equal(options.body.get("language"), "auto");
    assert.equal(options.body.get("isCreateSearchablePdf"), "true");
    assert.equal(options.body.get("isSearchablePdfHideTextLayer"), "true");
    assert.match(options.body.get("base64Image"), /^data:image\/png;base64,/);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return jsonResponse({
      ParsedResults: [
        { ParsedText: "Ini adalah dokumen Nexora yang dapat dicari dan disalin oleh pengguna.", FileParseExitCode: 1, TextOrientation: "0" },
        { ParsedText: "Halaman kedua berisi statistik dokumen dan hasil analisis.", FileParseExitCode: 1, TextOrientation: "0" }
      ],
      OCRExitCode: 1,
      IsErroredOnProcessing: false,
      SearchablePDFURL: "https://ocr.space/SearchablePDF/test.pdf",
      ProcessingTimeInMilliseconds: "321"
    });
  };

  const request = { fileData: dataUrl(png), fileName: "nexora-test.png", language: "auto", engine: 2, searchablePdf: true, hideTextLayer: true };
  const [first, coalesced] = await Promise.all([
    processDocument(request, { apiKey: "OCR_TEST_SECRET", fetchImpl }),
    processDocument(request, { apiKey: "OCR_TEST_SECRET", fetchImpl })
  ]);
  assert.equal(providerCalls, 1, "Dokumen identik yang bersamaan harus memakai satu request provider");
  assert.equal(first.text, coalesced.text);
  assert.equal(first.pages.length, 2);
  assert.equal(first.language.code, "id");
  assert.equal(first.stats.pages, 2);
  assert.equal(first.searchablePdf.available, true);
  assert.equal(first.searchablePdf.textLayerHidden, true);
  assert.equal(first.processingTimeMs, 321);
  assert.ok(!JSON.stringify(first).includes("OCR_TEST_SECRET"), "API key tidak boleh bocor ke respons");

  await assert.rejects(
    () => callOcrSpace(decoded, normalizeOptions({ engine: 2 }), { apiKey: "OCR_TEST_SECRET", fetchImpl: async () => jsonResponse({ error: "limit" }, 429) }),
    (error) => error.status === 429 && error.code === "OCR_PROVIDER_LIMIT"
  );

  const originalKey = process.env.OCR_SPACE_API_KEY;
  delete process.env.OCR_SPACE_API_KEY;
  const database = require("../lib/database");
  const originalDatabaseRequest = database.databaseRequest;
  database.databaseRequest = async (resource, options) => resource.startsWith("tools?select=access_level")
    ? [{ access_level: "free" }]
    : originalDatabaseRequest(resource, options);
  delete require.cache[require.resolve("../lib/account-membership")];
  delete require.cache[require.resolve("../api/tool-health")];
  try {
    const handler = require("../api/tool-health");
    const health = responseCapture();
    await handler({ method: "GET", url: "/api/tool-health?mode=ocr-intelligence&health=1", headers: { host: "nexora.test" }, socket: {} }, health.response);
    assert.equal(health.captured.status, 503, "Health harus jujur offline sampai API key terpasang");
    assert.equal(health.captured.payload.service, "nexora-ocr-intelligence");
    assert.equal(health.captured.payload.configured, false);
    assert.equal(health.captured.payload.provider.freeFileLimitBytes, MAX_FILE_BYTES);

    resetOcrIntelligenceState();
    const missingKey = responseCapture();
    const originalConsoleError = console.error;
    try {
      console.error = () => {};
      await handler({ method: "POST", url: "/api/tool-health?mode=ocr-intelligence", headers: { host: "nexora.test", "x-forwarded-for": "203.0.113.88" }, body: request, socket: {} }, missingKey.response);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(missingKey.captured.status, 503);
    assert.equal(missingKey.captured.payload.error, "OCR_API_KEY_MISSING");
  } finally {
    database.databaseRequest = originalDatabaseRequest;
    if (originalKey === undefined) delete process.env.OCR_SPACE_API_KEY; else process.env.OCR_SPACE_API_KEY = originalKey;
  }

  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(vercel.rewrites.some((row) => row.source === "/api/ocr-intelligence" && row.destination.includes("mode=ocr-intelligence")));
  const routeManifest = JSON.parse(read("route-manifest.json"));
  assert.ok(routeManifest.apiRoutes.includes("/api/ocr-intelligence"));
  const manifest = JSON.parse(read("assets/module-manifest.json"));
  assert.equal(manifest.tools.ocrintel, "ocr-intelligence");
  for (const asset of [...manifest.modules["ocr-intelligence"].css, ...manifest.modules["ocr-intelligence"].js]) assert.ok(fs.existsSync(path.join(root, asset)));

  const ui = read("assets/js/features/ocr-intelligence.js");
  for (const token of ["renderOcrIntelligence", "/api/ocr-intelligence", "fileToDataUrl", "Searchable PDF", "noiSearch", "body.__nxCleanup"]) assert.ok(ui.includes(token), `UI OCR kehilangan ${token}`);
  assert.ok(!ui.includes("OCR_SPACE_API_KEY"), "Nama/key server tidak boleh masuk UI");
  assert.ok(ui.includes("drawn<200"), "Highlight hasil pencarian harus dibatasi agar tetap ringan");
  const css = read("assets/css/features/ocr-intelligence.css");
  for (const token of ["overflow-x:clip", "min-width:0", "@media all", "prefers-reduced-motion"]) assert.ok(css.includes(token), `CSS OCR kehilangan ${token}`);
  assertBalancedCss(css);
  assert.ok(read("database/migrations/011_nexora_ocr_intelligence.sql").includes("on conflict (id) do update"));
  assert.ok(read(".env.example").includes("OCR_SPACE_API_KEY="));
  assert.ok(read("index.html").includes("v=6.4.0"));
  assert.equal(require("../assets/config.js").version, "6.4.0");
  assert.ok(read("assets/js/core/lazy-loader.js").includes("ASSET_VERSION = config.version"));

  const serverless = [];
  (function walk(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const target = path.join(directory, entry.name); if (entry.isDirectory()) walk(target); else if (target.endsWith(".js")) serverless.push(target); } })(path.join(root, "api"));
  assert.equal(serverless.length, 12);

  resetOcrIntelligenceState();
  console.log("OCR Intelligence HF8 tests lulus: file sniffing, batas 1 MB, key server-side, coalescing, language/stats, searchable PDF, mobile UI, migration, dan 12-function limit aman.");
}

main().catch((error) => { console.error(error); process.exit(1); });
