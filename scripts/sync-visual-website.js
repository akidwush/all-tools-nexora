"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.resolve(process.argv[2] || process.env.NEXORA_VISUAL_SOURCE || "");
const visualRoot = path.join(root, "assets", "visuals");
const demoRoot = path.join(visualRoot, "demos");
const manifestPath = path.join(visualRoot, "manifest.json");

if (!source || !fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
  console.error("Gunakan: node scripts/sync-visual-website.js /path/ke/Contents-Code");
  process.exit(1);
}

function titleFrom(filename, html) {
  const documentTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (documentTitle && !/^(?:codepen|document|untitled(?: document)?)$/i.test(documentTitle)) return documentTitle;
  return path.basename(filename, ".html")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function categoryFor(filename) {
  const value = filename.toLowerCase();
  if (/(loader|loading|preloader|dropping-balls|stairs)/.test(value)) return "loaders";
  if (/(button|login|nav-bar|navbar|feedback|counter|gallery|product|cursor|hover|card)/.test(value)) return "interface";
  if (/(heart|love|valentine|birthday|xmas|cake|fallin)/.test(value)) return "celebration";
  if (/(galaxy|cosmic|blackhole|comet|star-|orbs|dreamwave)/.test(value)) return "space";
  if (/(cat|dog|puppy|bear|bird|spider|puppet|mustache|dancin|robot|ghost)/.test(value)) return "characters";
  if (/(tree|flower|bee|snow-globe|fire|water)/.test(value)) return "nature";
  if (/(geometry|geometric|hex|hopf|dna|electromagnetic|neural|bioelectric|projection|plasma|pattern|shape|spiral|spring|lotus)/.test(value)) return "geometry";
  return "motion";
}

function engineFor(html) {
  if (/(three(?:\.min|\.module)?\.js|from\s+["'][^"']*three|WebGLRenderer|webgpu)/i.test(html)) return "webgl";
  if (/(<canvas\b|getContext\s*\(|p5\.js|createjs)/i.test(html)) return "canvas";
  if (/<svg\b/i.test(html)) return "svg";
  return "dom";
}

const files = fs.readdirSync(source, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));

if (!files.length) {
  console.error(`Tidak ada HTML di ${source}`);
  process.exit(1);
}

fs.rmSync(demoRoot, { recursive: true, force: true });
fs.mkdirSync(demoRoot, { recursive: true });

const demos = files.map((filename, index) => {
  const input = path.join(source, filename);
  let html = fs.readFileSync(input, "utf8");

  // Satu typo host pada sumber membuat GSAP tidak pernah dimuat di browser.
  html = html.replace(/https:\/\/unpkg\.co\/gsap@/g, "https://unpkg.com/gsap@");
  fs.writeFileSync(path.join(demoRoot, filename), html);

  const id = path.basename(filename, ".html")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const engine = engineFor(html);
  const externalUrls = html.match(/(?:https?:)?\/\/[^\s"'<>]+/g) || [];
  return {
    id,
    title: titleFrom(filename, html),
    filename,
    path: `assets/visuals/demos/${encodeURIComponent(filename)}`,
    category: categoryFor(filename),
    engine,
    network: externalUrls.some((url) => !/^https?:\/\/(?:www\.)?w3\.org\//i.test(url)),
    order: index + 1
  };
});

const manifest = {
  name: "Nexora Visual Website",
  source: "Takagi-Dev-content/Contents-Code",
  count: demos.length,
  demos
};

fs.mkdirSync(visualRoot, { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Nexora Visual Website: ${demos.length} HTML disalin ke assets/visuals/demos.`);
