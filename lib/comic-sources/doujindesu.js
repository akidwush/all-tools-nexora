"use strict";

/*
 * DoujinDesu is deliberately represented as an adult/experimental provider
 * without implementing protected/encrypted/anti-bot flows.
 *
 * Current Nexora policy: if a provider cannot be consumed through a normal,
 * documented HTTP flow, it remains UNSUPPORTED. No decryption bypass,
 * Cloudflare/CAPTCHA workaround, session harvesting, cookie theft or browser
 * fingerprint spoofing belongs here.
 */

const definition = Object.freeze({
  id: "doujindesu",
  label: "DoujinDesu",
  category: "adult-experimental",
  adult: true,
  experimental: true,
  defaultEnabled: false,
  optInRequired: true,
  participatesInSearch: false,
  participatesInFallback: false,
  participatesInExperimentalSearch: false,
  availability: "unsupported",
  unsupportedReason: "Upstream saat ini memerlukan protected/internal flow yang tidak diimplementasikan Nexora.",
  languages: ["id"],
  capabilities: Object.freeze({
    search: false,
    detail: false,
    chapters: false,
    pages: false,
    languageFilter: false,
    pagination: false,
    translationCompatible: false
  }),
  imageHostSuffixes: []
});

const endpointDefinition = Object.freeze({
  id: "experimental-comic:doujindesu",
  group: "experimental-comic",
  label: "DoujinDesu",
  category: "adult-experimental",
  defaultMode: "disabled",
  networkSupported: false,
  healthUnsupported: true,
  activationSupported: false,
  allowedHosts: [],
  defaultBaseUrl: "",
  defaultTimeoutMs: 10_000,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 60_000,
  healthPath: "",
  healthMethod: "HEAD",
  editableFields: [],
  unsupportedReason: definition.unsupportedReason,
  unavailableCode: "COMIC_EXPERIMENTAL_UNSUPPORTED"
});

function unsupported() {
  throw Object.assign(new Error(definition.unsupportedReason), {
    code: "COMIC_EXPERIMENTAL_UNSUPPORTED",
    status: 503,
    publicMessage: "Source experimental ini belum didukung tanpa bypass/protection workaround."
  });
}

async function search() { return unsupported(); }
async function getManga() { return unsupported(); }
async function getChapters() { return unsupported(); }
async function getPages() { return unsupported(); }

module.exports = {
  definition,
  endpointDefinition,
  search,
  getManga,
  getChapters,
  getPages
};
