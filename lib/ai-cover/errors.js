"use strict";

class CoverError extends Error {
  constructor(message, code = "COVER_PROVIDER_ERROR", status = 502, options = {}) {
    super(message);
    this.name = "CoverError";
    this.code = code;
    this.status = status;
    this.retryable = Boolean(options.retryable);
    this.provider = options.provider || "";
    this.retryAfter = Number(options.retryAfter) || 0;
    this.sourceStatus = Number(options.sourceStatus) || 0;
  }
}

function providerError(provider, error) {
  if (error instanceof CoverError) {
    error.provider ||= provider;
    return error;
  }
  const sourceStatus = Number(error?.status || error?.statusCode || error?.response?.status) || 0;
  const message = String(error?.message || "").toLowerCase();
  const options = { provider, sourceStatus };

  if (error?.name === "AbortError" || /timeout|aborted/.test(message)) {
    return new CoverError("Provider melewati batas waktu.", "COVER_TIMEOUT", 504, { ...options, retryable: true });
  }
  if (sourceStatus === 429 || /rate.?limit|too many requests/.test(message)) {
    return new CoverError("Provider sedang mencapai batas permintaan.", "COVER_RATE_LIMITED", 429, { ...options, retryable: true, retryAfter: 60 });
  }
  if (/insufficient|no credits?|credit balance|billing|payment required|spend limit|quota exceeded/.test(message)) {
    return new CoverError("Kredit atau billing provider belum tersedia.", "COVER_BILLING_REQUIRED", 402, { ...options, retryable: true });
  }
  if (/organization verification|verify (your )?organization|organization must be verified|not verified/.test(message)) {
    return new CoverError("Akun provider memerlukan verifikasi organisasi.", "COVER_PROVIDER_VERIFICATION", 503, { ...options, retryable: true });
  }
  if ([401, 403].includes(sourceStatus) || /api.?key|unauthor|credential|forbidden/.test(message)) {
    return new CoverError("API key provider tidak valid atau tidak memiliki izin.", "COVER_PROVIDER_AUTH", 503, { ...options, retryable: true });
  }
  if (/model.+(not found|unavailable|unsupported)|unknown model|invalid model/.test(message)) {
    return new CoverError("Model provider tidak tersedia untuk akun ini.", "COVER_MODEL_UNAVAILABLE", 503, { ...options, retryable: true });
  }
  if (/safety|moderation|content policy|content_policy|nsfw/.test(message)) {
    return new CoverError("Prompt atau referensi ditolak kebijakan provider.", "COVER_SAFETY_REJECTED", 422, options);
  }
  if (/invalid prompt|prompt is invalid|invalid image|invalid reference/.test(message)) {
    return new CoverError("Prompt atau referensi ditolak provider.", "COVER_INVALID_PROMPT", 422, options);
  }
  if ([400, 404, 409, 415, 422].includes(sourceStatus)) {
    return new CoverError("Provider menolak format atau model permintaan.", "COVER_PROVIDER_REQUEST", 503, { ...options, retryable: true });
  }
  return new CoverError("Provider gambar sedang tidak tersedia.", "COVER_PROVIDER_UNAVAILABLE", 503, {
    ...options,
    retryable: sourceStatus >= 500 || !sourceStatus
  });
}

module.exports = { CoverError, providerError };
