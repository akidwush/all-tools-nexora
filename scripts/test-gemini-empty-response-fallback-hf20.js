"use strict";

const assert = require("node:assert/strict");
const { generate: generateDocument } = require("../lib/document-ai");
const { geminiResponseDiagnostics, geminiResponseText } = require("../lib/gemini-config");
const { DEFAULT_MODEL } = require("../lib/personal-ai");
const { generatePrompt } = require("../lib/prompt-generator");

const promptJson = JSON.stringify({
  title: "Fallback visual",
  summary: "Fallback model berhasil membaca gambar.",
  prompt: "A clean professional visual prompt produced by the stable fallback model with clear subject, composition, lighting, palette, camera, and restrained styling.",
  negativePrompt: "blur, artifacts, distorted anatomy",
  details: { subject: "subject", environment: "studio", composition: "balanced", lighting: "soft", palette: ["cyan"], camera: "50mm", style: "clean" },
  keywords: ["clean", "studio"],
  warnings: [],
  variants: []
});

const documentJson = JSON.stringify({
  title: "Fallback dokumen",
  documentType: "Teks",
  language: "Indonesia",
  summary: "Analisis berhasil melalui model cadangan.",
  keyPoints: [], actions: [], studyNotes: [], extractedText: "Isi dokumen", tables: []
});

(async () => {
  const names = ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_MODEL", "PROMPT_GENERATOR_MODEL", "DOCUMENT_AI_MODEL"];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    names.forEach((name) => { delete process.env[name]; });
    process.env.GEMINI_API_KEY = "test-secret";
    process.env.PROMPT_GENERATOR_MODEL = DEFAULT_MODEL;
    process.env.DOCUMENT_AI_MODEL = DEFAULT_MODEL;

    const nestedResponse = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "candidate text" }] } }] };
    assert.equal(geminiResponseText(nestedResponse), "candidate text");
    assert.deepEqual(geminiResponseDiagnostics(nestedResponse), { candidateCount: 1, finishReasons: ["STOP"], blockReason: "" });

    const promptModels = [];
    const promptResult = await generatePrompt({
      image: { fileName: "reference.png", mimeType: "image/png", base64: "AA==" },
      options: { target: "universal", style: "auto", language: "en", aspectRatio: "auto", creativity: 3, direction: "", includeNegative: true },
      timeoutMs: 3000,
      clientFactory: async () => ({ models: { generateContent: async ({ model }) => {
        promptModels.push(model);
        if (model === DEFAULT_MODEL) return { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] };
        return { candidates: [{ finishReason: "STOP", content: { parts: [{ text: promptJson }] } }] };
      } } })
    });
    assert.match(promptResult.prompt, /stable fallback/i);
    assert.deepEqual(promptModels.slice(0, 2), [DEFAULT_MODEL, "gemini-2.5-flash"]);

    const blockedModels = [];
    await assert.rejects(() => generatePrompt({
      image: { fileName: "blocked.png", mimeType: "image/png", base64: "AA==" },
      options: { target: "universal", style: "auto", language: "en", aspectRatio: "auto", creativity: 3, direction: "", includeNegative: true },
      timeoutMs: 3000,
      clientFactory: async () => ({ models: { generateContent: async ({ model, config }) => {
        blockedModels.push(model);
        assert.equal(config.safetySettings, undefined, "Patch tidak boleh menurunkan safety threshold provider.");
        return { candidates: [], promptFeedback: { blockReason: "SAFETY" } };
      } } })
    }), (error) => error.code === "PROMPT_AI_BLOCKED" && error.status === 422);
    assert.deepEqual(blockedModels, [DEFAULT_MODEL, DEFAULT_MODEL], "Safety block hanya boleh satu neutral retry pada model yang sama, tanpa pindah model.");

    const documentModels = [];
    const rawDocument = await generateDocument({
      document: { text: "<document>Isi dokumen</document>" },
      prompt: "Analisis dokumen.",
      json: true,
      timeoutMs: 3000,
      clientFactory: async () => ({ models: { generateContent: async ({ model }) => {
        documentModels.push(model);
        if (model === DEFAULT_MODEL) return { text: "respons bukan JSON" };
        return { candidates: [{ finishReason: "STOP", content: { parts: [{ text: documentJson }] } }] };
      } } })
    });
    assert.equal(rawDocument, documentJson);
    assert.deepEqual(documentModels.slice(0, 2), [DEFAULT_MODEL, "gemini-2.5-flash"]);

    console.log("Gemini HF20 lulus: candidate-part extraction, empty/invalid response fallback, dan diagnostics aman aktif.");
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
})().catch((error) => { console.error(error); process.exit(1); });
