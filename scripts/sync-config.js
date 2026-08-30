"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const configPath = path.join(root, "assets", "config.js");
const manifestPath = path.join(root, "assets", "module-manifest.json");

function buildManifest(config) {
  const tools = {};
  for (const category of ["downloader", "maker", "tools", "vault", "external"]) {
    for (const tool of Array.isArray(config.tools?.[category]) ? config.tools[category] : []) {
      if (tool?.runtime?.module) tools[tool.id] = tool.runtime.module;
    }
  }
  return { version: 1, modules: config.modules || {}, tools };
}

function syncConfig({ silent = false } = {}) {
  delete require.cache[require.resolve(configPath)];
  const config = require(configPath);
  const next = JSON.stringify(buildManifest(config), null, 2) + "\n";
  const current = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "";
  if (current !== next) fs.writeFileSync(manifestPath, next);
  if (!silent) console.log(current === next ? "Konfigurasi modul sudah sinkron." : "Konfigurasi modul berhasil disinkronkan.");
  return { changed: current !== next, manifest: JSON.parse(next) };
}

if (require.main === module) syncConfig();

module.exports = { buildManifest, syncConfig };
