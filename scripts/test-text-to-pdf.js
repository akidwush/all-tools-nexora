"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { handleTextToPdf, normalizePayload, safeFilename } = require("../lib/text-to-pdf");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function responseMock() {
  const captured = { headers: {} };
  return {
    captured,
    response: {
      setHeader(name, value) { captured.headers[String(name).toLowerCase()] = String(value); },
      status(code) { captured.status = code; return this; },
      json(payload) { captured.payload = payload; return payload; },
      send(payload) { captured.body = payload; return payload; },
      end(payload) { captured.body = payload; captured.ended = true; return payload; }
    }
  };
}

async function main() {
  assert.equal(safeFilename(" Bab Satu?.pdf "), "Bab-Satu");
  const normalized = normalizePayload({
    sections: [{ title: " BAB 1 ", content: "Isi\r\nparagraf" }],
    settings: { paperSize: "LETTER", fontSize: 99, lineHeight: 0, margin: 1 },
    filename: "Novel Saya"
  });
  assert.equal(normalized.sections[0].content, "Isi\nparagraf");
  assert.equal(normalized.settings.paperSize, "A5");
  assert.equal(normalized.settings.fontSize, 18);
  assert.equal(normalized.settings.margin, 20);
  assert.equal(normalized.filename, "Novel-Saya");
  assert.throws(() => normalizePayload({ sections: [] }), /1-5 bagian/);

  const originalFetch = global.fetch;
  const originalUrl = process.env.NEXORA_PDF_API_URL;
  const originalKey = process.env.NEXORA_PDF_API_KEY;
  try {
    process.env.NEXORA_PDF_API_URL = "https://pdf-engine.example/api/pdf";
    process.env.NEXORA_PDF_API_KEY = "server-secret";
    let upstreamRequest = null;
    global.fetch = async function (url, options) {
      upstreamRequest = { url: String(url), options };
      return new Response(Buffer.from("%PDF-1.7\nmock"), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "attachment; filename=engine.pdf",
          "X-PDF-Pages": "3"
        }
      });
    };

    const success = responseMock();
    await handleTextToPdf({
      method: "POST",
      body: { sections: [{ title: "BAB 1", content: "Teks panjang." }], settings: {}, filename: "hasil" }
    }, success.response);
    assert.equal(success.captured.status, 200);
    assert.equal(success.captured.headers["content-type"], "application/pdf");
    assert.equal(success.captured.headers["x-pdf-pages"], "3");
    assert.equal(success.captured.headers["cache-control"], "no-store, no-cache, must-revalidate, max-age=0");
    assert.equal(Buffer.isBuffer(success.captured.body), true);
    assert.equal(upstreamRequest.url, "https://pdf-engine.example/api/pdf");
    assert.equal(upstreamRequest.options.headers["X-API-Key"], "server-secret");
    assert.equal(upstreamRequest.options.headers["Content-Type"], "application/json");
    assert.equal(String(upstreamRequest.options.body).includes("server-secret"), false);

    delete process.env.NEXORA_PDF_API_URL;
    delete process.env.NEXORA_PDF_API_KEY;
    const missing = responseMock();
    await handleTextToPdf({ method: "POST", body: { sections: [{ title: "BAB 1", content: "Tes" }] } }, missing.response);
    assert.equal(missing.captured.status, 503);
    assert.equal(missing.captured.payload.error, "PDF_API_NOT_CONFIGURED");
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXORA_PDF_API_URL; else process.env.NEXORA_PDF_API_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXORA_PDF_API_KEY; else process.env.NEXORA_PDF_API_KEY = originalKey;
  }

  const frontend = read("assets/js/features/text-to-pdf.js");
  for (const token of ["renderTextToPdf", "/api/tools/text-to-pdf", "Buat Preview", "Unduh PDF", "MAX_SECTIONS = 5"]) assert.ok(frontend.includes(token));
  assert.doesNotMatch(frontend, /NEXORA_PDF_API_KEY|X-API-Key/);

  const manifest = JSON.parse(read("assets/module-manifest.json"));
  assert.equal(manifest.tools.autopdf, "text-to-pdf");
  assert.ok(manifest.modules["text-to-pdf"].js.includes("assets/js/features/text-to-pdf.js"));
  assert.ok(JSON.parse(read("route-manifest.json")).apiRoutes.includes("/api/tools/text-to-pdf"));
  assert.match(read("vercel.json"), /\/api\/tools\/text-to-pdf[\s\S]*mode=text-to-pdf/);
  assert.match(read(".env.example"), /NEXORA_PDF_API_URL=[\s\S]*NEXORA_PDF_API_KEY=/);
  console.log("Nexora Auto PDF tests lulus: validasi, proxy binary, header, secret isolation, route, dan modul UI.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
