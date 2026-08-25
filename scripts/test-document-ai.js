"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { generate, handleDocumentAi, MAX_BINARY_BYTES, parseDocument, parseJsonResponse } = require("../lib/document-ai");
const { GEMINI_API_KEY_ENV_NAMES } = require("../lib/gemini-config");
const { DEFAULT_MODEL } = require("../lib/personal-ai");

const root = path.resolve(__dirname, "..");

const textDocument = parseDocument({
  fileName: "catatan.md",
  mimeType: "",
  fileData: `data:text/markdown;base64,${Buffer.from("# Catatan\nIsi aman", "utf8").toString("base64")}`
});
assert.equal(textDocument.mimeType, "text/markdown", "MIME harus dapat diinferensikan dari ekstensi.");
assert.ok(textDocument.estimatedBytes > 0 && textDocument.estimatedBytes < MAX_BINARY_BYTES);

assert.throws(() => parseDocument({
  fileName: "terlalu-besar.pdf",
  mimeType: "application/pdf",
  fileData: Buffer.alloc(MAX_BINARY_BYTES + 1).toString("base64")
}), /maksimal/i);

assert.throws(() => parseDocument({
  fileName: "payload.html",
  mimeType: "text/html",
  fileData: Buffer.from("<script>alert(1)</script>").toString("base64")
}), /format belum didukung/i);

const parsed = parseJsonResponse("```json\n" + JSON.stringify({
  title: "Laporan",
  documentType: "Laporan teknis",
  language: "Indonesia",
  summary: "Ringkas [Halaman 1]",
  keyPoints: ["Satu"],
  actions: [],
  studyNotes: ["Catatan"],
  extractedText: "Isi",
  tables: [{ title: "Data", headers: ["Nama"], rows: [["Nexora"]] }]
}) + "\n```");
assert.equal(parsed.title, "Laporan");
assert.equal(parsed.tables[0].rows[0][0], "Nexora");

const migration = fs.readFileSync(path.join(root, "database/migrations/023_document_ai_vvip.sql"), "utf8");
assert.match(migration, /'documentai'[\s\S]*?'vvip'/i, "Document AI harus VVIP secara default.");
assert.match(migration, /for update/i, "Konsumsi kuota harus dikunci secara atomik.");
const appSource = fs.readFileSync(path.join(root, "assets/js/core/app.js"), "utf8");
assert.match(appSource, /base\.accessLevel === 'vvip'/, "Lock VVIP bawaan tidak boleh hilang ketika migration database belum dijalankan.");
const lazySource = fs.readFileSync(path.join(root, "assets/js/core/lazy-loader.js"), "utf8");
assert.match(lazySource, /NexoraAccount\.canAccess\(toolId\)/, "Deep link lazy tool harus tetap melewati guard VVIP.");
const accountSource = fs.readFileSync(path.join(root, "assets/js/core/account.js"), "utf8");
assert.match(accountSource, /defaultRestrictedTools=new Map\(\[\["documentai"/, "Guard VVIP harus fail-closed sebelum kartu katalog selesai dirender.");
const documentCss = fs.readFileSync(path.join(root, "assets/css/features/document-ai.css"), "utf8");
assert.match(documentCss, /\.nda \[hidden\]\{display:none!important\}/, "Elemen hasil tersembunyi tidak boleh bocor sebelum analisis.");
assert.match(documentCss, /tool-viewer-content:has\(\.nda\)/, "Workspace desktop harus menggunakan room lebar.");

const response = {
  headers: {},
  statusCode: 0,
  payload: null,
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return payload; },
  end() { return null; }
};

(async () => {
  const envNames = [...GEMINI_API_KEY_ENV_NAMES, "GEMINI_MODEL", "DOCUMENT_AI_MODEL"];
  const originalEnvironment = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  try {
    envNames.forEach((name) => { delete process.env[name]; });
    await handleDocumentAi({ method: "GET", headers: {}, url: "/api/document-ai" }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.configured, false);
    assert.equal(response.payload.limits.maxBytes, MAX_BINARY_BYTES);
    assert.ok(response.payload.formats.includes("application/pdf"));

    process.env.GOOGLE_API_KEY = '"document-alias-test-key"';
    process.env.DOCUMENT_AI_MODEL = "gemini-missing-test-model";
    await handleDocumentAi({ method: "GET", headers: {}, url: "/api/document-ai" }, response);
    assert.equal(response.payload.configured, true, "Health harus mengenali alias GOOGLE_API_KEY.");
    assert.ok(response.payload.acceptedKeyVariables.includes("GOOGLE_API_KEY"));

    const attemptedModels = [];
    const generated = await generate({
      document: textDocument,
      prompt: "Ringkas dokumen ini.",
      timeoutMs: 3000,
      clientFactory: async (apiKey) => {
        assert.equal(apiKey, "document-alias-test-key");
        return { models: { generateContent: async (payload) => {
          attemptedModels.push(payload.model);
          if (payload.model === "gemini-missing-test-model") throw { error: { code: "NOT_FOUND", message: "Model not found" } };
          return { text: "Ringkasan dokumen berhasil." };
        } } };
      }
    });
    assert.equal(generated, "Ringkasan dokumen berhasil.");
    assert.deepEqual(attemptedModels, ["gemini-missing-test-model", DEFAULT_MODEL]);

    let authAttempts = 0;
    await assert.rejects(() => generate({
      document: textDocument,
      prompt: "Ringkas.",
      timeoutMs: 3000,
      clientFactory: async () => ({ models: { generateContent: async () => {
        authAttempts += 1;
        throw { response: { status: 403, data: { error: { status: "PERMISSION_DENIED", message: "API key not valid" } } } };
      } } })
    }), (error) => error.code === "DOCUMENT_AI_AUTH_FAILED" && error.status === 503);
    assert.equal(authAttempts, 1, "Auth error tidak boleh di-retry ke model lain.");

    console.log("Document AI lulus: validasi file, alias API key, fallback model, auth fail-fast, VVIP, kuota, dan health endpoint.");
  } finally {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
