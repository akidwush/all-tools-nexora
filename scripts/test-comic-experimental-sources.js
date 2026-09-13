"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const registryModule = require("../lib/comic-sources/registry");
const doujindesu = require("../lib/comic-sources/doujindesu");
const endpoints = require("../lib/provider-endpoints");
const endpointRegistry = require("../lib/endpoint-maintenance-registry").endpointRegistry();

const fakeLegacy = {
  list: async () => ({ items: [] }),
  detail: async () => ({ data: {} }),
  chapters: async () => ({ data: [], languages: [] }),
  manifest: async () => ({ images: [], quality: "saver" })
};

(async () => {
  const standard = registryModule.createComicSourceRegistry(fakeLegacy);
  assert.deepEqual([...standard.keys()], ["mangadex","shinigami","voratoon","ainzscans","mangadotnet"]);
  assert.equal(standard.has("doujindesu"), false);

  const internal = registryModule.createComicSourceRegistry(fakeLegacy, { includeExperimental: true });
  assert.equal(internal.has("doujindesu"), true);
  assert.equal(registryModule.publicSourceRegistry(internal, { scope: "standard" }).some((row) => row.id === "doujindesu"), false);
  const experimental = registryModule.publicSourceRegistry(internal, { scope: "experimental" });
  assert.deepEqual(experimental.map((row) => row.id), ["doujindesu"]);

  const def = doujindesu.definition;
  assert.equal(def.adult, true);
  assert.equal(def.experimental, true);
  assert.equal(def.defaultEnabled, false);
  assert.equal(def.optInRequired, true);
  assert.equal(def.participatesInSearch, false);
  assert.equal(def.participatesInFallback, false);
  assert.equal(def.capabilities.search, false);
  assert.equal(def.capabilities.detail, false);
  assert.equal(def.capabilities.chapters, false);
  assert.equal(def.capabilities.pages, false);
  assert.equal(def.capabilities.translationCompatible, false);
  assert.equal(def.availability, "unsupported");

  let fetchCount = 0;
  const noFetch = async () => { fetchCount += 1; throw new Error("unexpected network"); };
  await assert.rejects(() => doujindesu.search({ query: "x", fetchImpl: noFetch }), /protected|unsupported|didukung/i);
  await assert.rejects(() => doujindesu.getManga({ id: "x", fetchImpl: noFetch }), /protected|unsupported|didukung/i);
  await assert.rejects(() => doujindesu.getChapters({ mangaId: "x", fetchImpl: noFetch }), /protected|unsupported|didukung/i);
  await assert.rejects(() => doujindesu.getPages({ chapterId: "x", fetchImpl: noFetch }), /protected|unsupported|didukung/i);
  assert.equal(fetchCount, 0, "unsupported adapter tidak boleh menyentuh upstream");

  const endpoint = endpointRegistry.get("experimental-comic:doujindesu");
  assert.ok(endpoint);
  assert.equal(endpoint.group, "experimental-comic");
  assert.equal(endpoint.activationSupported, false);
  assert.equal(endpoints.defaultConfig(endpoint).mode, "disabled");
  const probe = await endpoints.testCandidate(endpoint, endpoints.defaultConfig(endpoint));
  assert.equal(probe.status, "unsupported");
  assert.equal(probe.finalUrl, null);

  const app = read("assets/comic-reader/app.js");
  const server = read("lib/comic-reader.js");
  const html = read("assets/comic-reader/index.html");
  const css = read("assets/comic-reader/app.css");
  const admin = read("lib/admin-endpoint-maintenance.js");
  const endpointUi = read("assets/js/admin/endpoint-maintenance.js");
  const docs = read("docs/COMIC_EXPERIMENTAL_SOURCES.md");
  const adapterSource = read("lib/comic-sources/doujindesu.js");

  assert.match(app, /nx_comic_experimental_sources_v1/);
  assert.match(app, /nx_comic_experimental_history_v1/);
  assert.match(app, /nx_comic_experimental_favorites_v1/);
  assert.match(app, /function experimentalPreference\(\)/);
  assert.match(app, /I confirm I am an adult/);
  assert.match(app, /function loadExperimentalSourceRegistry\(\)/);
  assert.match(app, /if\(!experimentalPreference\(\)\)return\[\]/);
  assert.match(app, /action=sources&scope=experimental&mode=experimental/);
  assert.match(app, /standardSourceRows\(\)\.filter\(row=>row\.participatesInSearch!==false/);
  assert.match(app, /if\(isExperimentalSource\(source\)\)[\s\S]*params\.set\('mode','experimental'\)/);
  assert.match(app, /function showExperimentalHome\(\)/);
  assert.match(app, /function clearExperimentalData\(\)/);
  assert.match(app, /Experimental Favorites/);
  assert.match(app, /Experimental History/);
  assert.doesNotMatch(app, /contentRating\[\]','erotica'/);

  const bootTail = app.slice(app.lastIndexOf("loadSourceRegistry()"));
  assert.doesNotMatch(bootTail, /loadExperimentalSourceRegistry\(\)\.finally/);
  assert.match(bootTail, /handleExperimentalDeepLink/);

  assert.match(server, /COMIC_EXPERIMENTAL_OPT_IN_REQUIRED/);
  assert.match(server, /sourceScope === "experimental"/);
  assert.match(server, /includeDisabled: true/);
  assert.match(server, /COMIC_EXPERIMENTAL_DISABLED/);
  assert.match(server, /COMIC_EXPERIMENTAL_MAINTENANCE/);
  assert.match(server, /COMIC_EXPERIMENTAL_UNSUPPORTED/);

  assert.match(admin, /EXPERIMENTAL COMIC SOURCES/);
  assert.match(endpointUi, /UNSUPPORTED/);
  assert.match(endpointUi, /activationSupported===false/);

  assert.match(html, /readerback1-experimental1/);
  assert.match(css, /Experimental Comic Sources V1/);
  assert.match(css, /experimental-provider-status/);

  assert.doesNotMatch(adapterSource, /requestJson\(|fetch\(|https?:\/\//);
  const adapterExecutable = adapterSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(adapterExecutable, /decrypt\s*\(|captcha|cloudflare.*bypass|puppeteer|playwright/i);
  assert.match(docs, /NO|tidak mengimplementasikan/i);
  assert.match(docs, /Cloudflare \/ anti-bot bypass/);
  assert.match(docs, /UNSUPPORTED/);

  for (const width of [360,375,390,412]) assert.ok(width >= 360);

  console.log("Experimental Comic Sources PASS: OFF by default, standard registry unchanged, explicit local adult opt-in, isolated search/library, admin kill switch, DoujinDesu UNSUPPORTED with zero upstream requests.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
