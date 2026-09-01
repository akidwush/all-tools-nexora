"use strict";

const { CoverError, providerError } = require("./errors");
const { normalizeResult } = require("./normalizer");
const { createRegistry } = require("./registry");

const health = new Map();
const ORDER = ["recraft", "ideogram", "fal", "openai", "stability", "runware", "huggingface"];

function requiredCapabilities(input) {
  const required = ["textToImage"];
  if (input.referenceImage) required.push("referenceImage");
  if (input.styleReference) required.push("styleReference");
  if (input.useNexoraStyle) required.push(input.nexoraStyleType === "recraft" ? "customStyle" : "lora");
  if (input.typographyMode === "ai") required.push("textRendering");
  return required;
}

function providerOrder(input) {
  if (input.useNexoraStyle) return ["fal", "recraft", "runware", "huggingface", "openai", "ideogram", "stability"];
  if (input.referenceImage || input.styleReference) return ["openai", "fal", "recraft", "runware", "huggingface"];
  if (input.typographyMode === "ai") return ["ideogram", "openai", "recraft", "fal"];
  return ORDER;
}

function candidates(input, registry = createRegistry(), provider) {
  const required = requiredCapabilities(input);
  return (provider && provider !== "auto" ? [provider] : providerOrder(input))
    .map((id) => registry.get(id))
    .filter((entry) => entry?.enabled
      && required.every((capability) => entry.capabilities[capability])
      && (!health.get(entry.id)?.cooldownUntil || health.get(entry.id).cooldownUntil <= Date.now()));
}

function diagnostic(error) {
  return {
    provider: error.provider || "unknown",
    code: error.code || "COVER_PROVIDER_ERROR",
    message: error.message || "Provider gagal."
  };
}

async function runProvider(provider, input, context = {}) {
  try {
    const result = normalizeResult(provider.id, provider.model, await provider.generate(input, {
      ...context,
      apiKey: provider.apiKey
    }));
    health.set(provider.id, { status: "healthy", cooldownUntil: 0 });
    return result;
  } catch (error) {
    const normalized = providerError(provider.id, error);
    const cooldownMs = normalized.code === "COVER_RATE_LIMITED" ? 60000 : normalized.retryable ? 30000 : 0;
    health.set(provider.id, { status: "degraded", code: normalized.code, cooldownUntil: Date.now() + cooldownMs });
    throw normalized;
  }
}

async function generateAuto(input, options = {}) {
  const registry = options.registry || createRegistry();
  const providers = candidates(input, registry);
  if (!providers.length) throw new CoverError("Tidak ada provider aktif yang mendukung konfigurasi ini.", "COVER_NO_PROVIDER", 503);

  const diagnostics = [];
  let lastError;
  for (const provider of providers.slice(0, Math.min(3, options.maxAttempts || 3))) {
    try {
      return {
        result: await runProvider(provider, input, options.context),
        attempts: [...diagnostics.map((item) => item.provider), provider.id],
        diagnostics
      };
    } catch (error) {
      lastError = error;
      diagnostics.push(diagnostic(error));
      if (!error.retryable) break;
    }
  }
  lastError.attempts = diagnostics.map((item) => item.provider);
  lastError.diagnostics = diagnostics;
  throw lastError;
}

async function generateManual(input, id, options = {}) {
  const provider = candidates(input, options.registry || createRegistry(), id)[0];
  if (!provider) throw new CoverError("Provider tidak aktif atau capability tidak cocok.", "COVER_PROVIDER_DISABLED", 400);
  return runProvider(provider, input, options.context);
}

async function generateComparison(input, ids, options = {}) {
  ids = [...new Set(ids)].slice(0, 4);
  if (ids.length < 2) throw new CoverError("Pilih minimal 2 provider.", "COVER_COMPARE_SELECTION", 400);
  const rows = await Promise.all(ids.map(async (id) => {
    try {
      return { provider: id, ok: true, result: await generateManual({ ...input, variations: 1 }, id, options) };
    } catch (error) {
      const normalized = error instanceof CoverError ? error : providerError(id, error);
      return { provider: id, ok: false, error: diagnostic(normalized) };
    }
  }));
  if (!rows.some((row) => row.ok)) throw new CoverError("Semua provider perbandingan gagal.", "COVER_COMPARE_FAILED", 502);
  return rows;
}

const healthSnapshot = (registry) => [...registry.values()].map((provider) => ({
  id: provider.id,
  enabled: provider.enabled,
  ...(health.get(provider.id) || { status: provider.enabled ? "configured" : "disabled" })
}));

module.exports = { candidates, generateAuto, generateManual, generateComparison, healthSnapshot, runProvider, _health: health };
