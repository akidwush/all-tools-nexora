"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const config = require(path.join(root, "assets/config.js"));
const tools = ["downloader", "maker", "tools", "vault", "external"].flatMap((category) =>
  (Array.isArray(config.tools[category]) ? config.tools[category] : []).map((tool) => ({ ...tool, category }))
);

function getTool(id) {
  return tools.find((tool) => tool.id === id) || null;
}

function loadRegistry() {
  const sandbox = { window: { dispatchEvent() {} }, CustomEvent: function CustomEvent() {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "assets/config.js"), "utf8"), sandbox, { filename: "config.js" });
  vm.runInNewContext(fs.readFileSync(path.join(root, "assets/js/core/tool-registry.js"), "utf8"), sandbox, { filename: "tool-registry.js" });
  return sandbox.window.NexoraToolRegistry;
}

module.exports = { config, tools, getTool, loadRegistry };
