"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const legacyTerms = [
  ["fla", "mo"].join(""),
  ["nex", "us"].join(""),
  ["vy", "an"].join("")
];
const providerTerm = ["gem", "ini"].join("");
const textPattern = /\.(?:css|html|js|json|md|sql|xml)$/i;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "public", ".git"].includes(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function legacyMatches(value) {
  const normalized = String(value || "").toLowerCase();
  return legacyTerms.filter((term) => normalized.includes(term));
}

const files = walk(root);
const textFiles = files.filter((file) => textPattern.test(file));
const failures = [];

for (const file of files) {
  const matches = legacyMatches(relative(file));
  if (matches.length) failures.push(`${relative(file)}: path contains retired identity`);
}

for (const file of textFiles) {
  const source = fs.readFileSync(file, "utf8");
  const matches = legacyMatches(source);
  if (matches.length) failures.push(`${relative(file)}: source contains retired identity`);

  for (const match of source.matchAll(/["']([A-Za-z0-9+/]{1000,}={0,2})["']/g)) {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    if (legacyMatches(decoded).length) failures.push(`${relative(file)}: embedded payload contains retired identity`);
  }
}

const uiFiles = [
  path.join(root, "index.html"),
  path.join(root, "about.html"),
  path.join(root, "feedback.html"),
  ...walk(path.join(root, "admin")),
  ...walk(path.join(root, "assets"))
].filter((file) => textPattern.test(file) && relative(file) !== "assets/js/features/puter-image.js");

for (const file of uiFiles) {
  const source = fs.readFileSync(file, "utf8").toLowerCase();
  if (source.includes(providerTerm)) failures.push(`${relative(file)}: provider name leaks into branded UI copy`);
}

assert.equal(failures.length, 0, failures.join("\n"));
assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /All Tools Nexora/);
assert.match(fs.readFileSync(path.join(root, "assets/js/core/tool-registry.js"), "utf8"), /Nexora Document AI/);
assert.doesNotMatch(fs.readFileSync(path.join(root, "assets/js/features/nexora/nexora-runtime.js"), "utf8"), /NexoraNexora|nexora:nexora/i);

console.log("Branding audit lulus: source, path, embedded payload, metadata, dan UI copy konsisten Nexora.");
