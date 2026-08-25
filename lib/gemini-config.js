"use strict";

const GEMINI_API_KEY_ENV_NAMES = Object.freeze([
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_GEMINI_API_KEY",
  "GOOGLE_API_KEY"
]);

// Keep these as real, generally available text + vision models. Environment
// overrides remain first, while this list prevents one unavailable model from
// taking Prompt Generator and Document AI offline together.
const GEMINI_FALLBACK_MODELS = Object.freeze([
  "gemini-2.5-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite"
]);

function unwrap(value) {
  let result = String(value ?? "").replace(/^\uFEFF/, "").trim();
  if (result.length >= 2) {
    const first = result[0];
    const last = result[result.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) result = result.slice(1, -1).trim();
  }
  return result;
}

function normalizeGeminiApiKey(value) {
  let result = unwrap(value);
  const assignment = result.match(/^(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|GOOGLE_GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.+)$/i);
  if (assignment) result = unwrap(assignment[1]);
  return result.replace(/[\r\n]/g, "").trim().slice(0, 1000);
}

function resolveGeminiApiKey(environment = process.env) {
  for (const envName of GEMINI_API_KEY_ENV_NAMES) {
    const apiKey = normalizeGeminiApiKey(environment?.[envName]);
    if (apiKey) return { apiKey, configured: true, envName };
  }
  return { apiKey: "", configured: false, envName: "" };
}

function cleanModel(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
}

function geminiModelCandidates(serviceEnvName, defaultModel, environment = process.env) {
  const serviceModel = serviceEnvName ? cleanModel(environment?.[serviceEnvName]) : "";
  const sharedModel = cleanModel(environment?.GEMINI_MODEL);
  return [...new Set([
    serviceModel,
    sharedModel,
    cleanModel(defaultModel),
    ...GEMINI_FALLBACK_MODELS.map(cleanModel)
  ].filter(Boolean))];
}

function geminiGenerationConfig(model, config = {}) {
  const normalized = { ...config };
  const version = cleanModel(model).match(/^gemini-(\d+)(?:\.(\d+))?-/i);
  const major = Number(version?.[1] || 0);
  const minor = Number(version?.[2] || 0);
  if (major > 3 || (major === 3 && minor >= 6)) {
    delete normalized.temperature;
    delete normalized.topP;
    delete normalized.topK;
  }
  return normalized;
}

// Prompt Generator and Document AI need predictable response times inside a
// serverless request. Gemini 3 uses thinkingLevel, while Gemini 2.5 Flash uses
// the older thinkingBudget setting. Keep this opt-in so Personal AI and other
// Gemini consumers retain their existing reasoning behavior.
function geminiLowLatencyConfig(model, config = {}) {
  const normalized = geminiGenerationConfig(model, config);
  const modelId = cleanModel(model).replace(/^models\//i, "").toLowerCase();
  if (/^gemini-3(?:[.-]|$)/.test(modelId)) {
    normalized.thinkingConfig = { thinkingLevel: "low" };
  } else if (/^gemini-2\.5-flash(?:-|$)/.test(modelId)) {
    normalized.thinkingConfig = { thinkingBudget: 0 };
  }
  return normalized;
}

function geminiErrorDetails(error) {
  const nested = error?.error || error?.response?.data?.error || error?.cause || {};
  const numericCandidates = [error?.status, error?.statusCode, error?.response?.status, nested?.status, nested?.statusCode, nested?.code];
  const status = numericCandidates.map(Number).find((value) => Number.isInteger(value) && value >= 400 && value <= 599) || 0;
  const providerCode = [error?.code, error?.status, nested?.code, nested?.status]
    .find((value) => typeof value === "string" && value.trim()) || "";
  const message = [error?.message, nested?.message, error?.response?.statusText]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();
  return { status, providerCode: String(providerCode).trim().toUpperCase(), message };
}

module.exports = {
  GEMINI_API_KEY_ENV_NAMES,
  GEMINI_FALLBACK_MODELS,
  geminiErrorDetails,
  geminiGenerationConfig,
  geminiLowLatencyConfig,
  geminiModelCandidates,
  normalizeGeminiApiKey,
  resolveGeminiApiKey
};
