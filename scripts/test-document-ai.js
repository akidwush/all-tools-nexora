"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { handleDocumentAi, MAX_BINARY_BYTES, parseDocument, parseJsonResponse } = require("../lib/document-ai");

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
  await handleDocumentAi({ method: "GET", headers: {}, url: "/api/document-ai" }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.limits.maxBytes, MAX_BINARY_BYTES);
  assert.ok(response.payload.formats.includes("application/pdf"));
  console.log("Document AI: validasi file, parser hasil, VVIP, kuota atomik, dan health endpoint lulus.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
