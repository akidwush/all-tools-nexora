
"use strict";

const assert = require("node:assert/strict");
const adapter = require("../lib/comic-sources/doujindesu");
const registryModule = require("../lib/comic-sources/registry");
const { endpointRegistry } = require("../lib/endpoint-maintenance-registry");

assert.equal(adapter.definition.adult, true);
assert.equal(adapter.definition.experimental, true);
assert.equal(adapter.definition.defaultEnabled, false);
assert.equal(adapter.definition.optInRequired, true);
assert.equal(adapter.definition.participatesInSearch, false);
assert.equal(adapter.definition.participatesInFallback, false);
assert.equal(adapter.definition.participatesInExperimentalSearch, true);
assert.equal(adapter.definition.capabilities.search, true);
assert.equal(adapter.definition.capabilities.detail, true);
assert.equal(adapter.definition.capabilities.chapters, true);
assert.equal(adapter.definition.capabilities.pages, false);
assert.equal(adapter.definition.capabilities.translationCompatible, false);
assert.deepEqual(adapter.definition.imageHostSuffixes, ["doujin.desu.xxx"]);

const endpoint = endpointRegistry().get("experimental-comic:doujindesu");
assert.ok(endpoint);
assert.equal(endpoint.defaultMode, "active");
assert.deepEqual(endpoint.allowedHosts, ["doujin.desu.xxx"]);
assert.equal(endpoint.activationSupported, true);
assert.ok(endpoint.editableFields.includes("baseUrl"));
assert.ok(endpoint.editableFields.includes("timeoutMs"));

const fakeLegacy = {
  list: async () => ({ items: [] }),
  detail: async () => ({ data: {} }),
  chapters: async () => ({ data: [], languages: [] }),
  manifest: async () => ({ images: [], quality: "saver" })
};
const standard = registryModule.createComicSourceRegistry(fakeLegacy);
assert.equal(standard.has("doujindesu"), false);
const internal = registryModule.createComicSourceRegistry(fakeLegacy, { includeExperimental: true });
assert.equal(internal.has("doujindesu"), true);
assert.equal(registryModule.publicSourceRegistry(internal, { scope: "standard" }).some((row) => row.id === "doujindesu"), false);
assert.equal(registryModule.publicSourceRegistry(internal, { scope: "experimental" }).some((row) => row.id === "doujindesu"), true);

console.log("DoujinDesu adapter PASS: experimental isolation and capabilities verified.");
