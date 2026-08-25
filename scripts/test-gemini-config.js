"use strict";

const assert = require("node:assert/strict");
const {
  GEMINI_API_KEY_ENV_NAMES,
  geminiErrorDetails,
  geminiGenerationConfig,
  geminiModelCandidates,
  normalizeGeminiApiKey,
  resolveGeminiApiKey
} = require("../lib/gemini-config");

assert.equal(normalizeGeminiApiKey('  "AIza-test-key"  '), "AIza-test-key");
assert.equal(normalizeGeminiApiKey("export GEMINI_API_KEY='AIza-assignment-key'"), "AIza-assignment-key");
assert.equal(normalizeGeminiApiKey("GOOGLE_API_KEY=AIza-google-key\n"), "AIza-google-key");

const primary = resolveGeminiApiKey({ GEMINI_API_KEY: "primary", GOOGLE_API_KEY: "fallback" });
assert.deepEqual(primary, { apiKey: "primary", configured: true, envName: "GEMINI_API_KEY" });
const alias = resolveGeminiApiKey({ GOOGLE_GENERATIVE_AI_API_KEY: '"alias-key"' });
assert.deepEqual(alias, { apiKey: "alias-key", configured: true, envName: "GOOGLE_GENERATIVE_AI_API_KEY" });
assert.equal(resolveGeminiApiKey({}).configured, false);

assert.deepEqual(
  geminiModelCandidates("DOCUMENT_AI_MODEL", "gemini-stable", { DOCUMENT_AI_MODEL: "gemini-custom", GEMINI_MODEL: "gemini-shared" }),
  ["gemini-custom", "gemini-shared", "gemini-stable"]
);
assert.deepEqual(geminiModelCandidates("DOCUMENT_AI_MODEL", "gemini-stable", { DOCUMENT_AI_MODEL: "gemini-stable" }), ["gemini-stable"]);
assert.deepEqual(geminiGenerationConfig("gemini-3.6-flash", { temperature: 0.2, topP: 0.9, topK: 20, maxOutputTokens: 1000 }), { maxOutputTokens: 1000 });
assert.equal(geminiGenerationConfig("gemini-3.5-flash", { temperature: 0.2 }).temperature, 0.2);

const nested = geminiErrorDetails({ response: { status: 403, data: { error: { status: "PERMISSION_DENIED", message: "API key not valid" } } } });
assert.equal(nested.status, 403);
assert.equal(nested.providerCode, "PERMISSION_DENIED");
assert.match(nested.message, /api key/i);
assert.deepEqual([...GEMINI_API_KEY_ENV_NAMES], ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_GEMINI_API_KEY", "GOOGLE_API_KEY"]);

console.log("Gemini config lulus: alias key, normalisasi nilai Vercel, prioritas, model fallback, dan nested provider error aktif.");
