"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const html = read("index.html");
const postload = read("assets/js/core/postload.js");
const vercel = JSON.parse(read("vercel.json"));
const webIntel = read("lib/web-intelligence.js");

const head = (html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i) || ["", ""])[1];
const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
const blocking = [...head.matchAll(/<script\b([^>]*)>/gi)].filter((match) => {
  const attrs = match[1] || "";
  return /\bsrc\s*=/.test(attrs) && !/\b(?:async|defer)\b/i.test(attrs) && !/\btype\s*=\s*["']module["']/i.test(attrs);
});
function attrs(tag){
  const out={};
  const re=/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while((match=re.exec(String(tag||"")))){
    const name=match[1].toLowerCase();
    if(!name.startsWith("<") && !(name in out)) out[name]=match[2]??match[3]??match[4]??"";
  }
  return out;
}
const stylesheets = [...html.matchAll(/<link\b[^>]*>/gi)].filter((match) => /\bstylesheet\b/i.test(attrs(match[0]).rel || ""));

assert.ok(scripts.length <= 15, `Safe Pass: static script tags harus <=15, aktual ${scripts.length}`);
assert.equal(blocking.length, 0, `Safe Pass: head external blocking scripts harus 0, aktual ${blocking.length}`);
assert.ok(stylesheets.length <= 8, `Safe Pass: static stylesheet tags harus <=8, aktual ${stylesheets.length}`);
assert.match(html, /class="nx-skip-link"[^>]+href="#main-content"/);
assert.match(html, /id="main-content"[^>]+tabindex="-1"/);
assert.match(html, /assets\/js\/core\/postload\.js\?v=6\.4\.0-safe-pass1/);

const expectedPostload = [
  "assets/js/core/social-links.js",
  "assets/branding.js",
  "assets/js/core/tool-health.js",
  "assets/js/core/analytics.js",
  "assets/js/core/personal-ai.js",
  "assets/js/core/custom-select.js",
  "assets/js/features/visual-website.js",
  "assets/js/features/placeholder-prompt-limit.js"
];
for (const asset of expectedPostload) assert.ok(postload.includes(asset), `Safe Pass postload hilang: ${asset}`);

const globalHeaders = vercel.headers?.[0]?.headers || [];
const header = (key) => globalHeaders.find((row) => String(row.key || "").toLowerCase() === key.toLowerCase())?.value || "";
assert.equal(header("Cross-Origin-Opener-Policy"), "same-origin-allow-popups");
const csp = header("Content-Security-Policy");
const scriptSrc = csp.split(/;\s*/).find((directive) => directive.trim().toLowerCase().startsWith("script-src ")) || "";
assert.ok(scriptSrc.split(/\s+/).includes("'wasm-unsafe-eval'"), "WASM policy yang dibutuhkan tool lokal harus tetap tersedia");
assert.ok(!scriptSrc.split(/\s+/).includes("'unsafe-eval'"), "unsafe-eval umum tidak boleh masuk CSP");
assert.match(webIntel, /includes\("'unsafe-eval'"\)/, "Web Intelligence harus membedakan unsafe-eval dari wasm-unsafe-eval");

console.log(`Nexora Performance & Security Safe Pass lulus: ${scripts.length} script, ${blocking.length} blocking, ${stylesheets.length} stylesheet, skip-link + COOP aktif, CSP WASM tidak lagi false-positive.`);
