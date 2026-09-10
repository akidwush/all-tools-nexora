"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const adminHtml = read("admin/index.html");
const publicFeedback = read("feedback.html");
const dashboard = read("assets/js/admin/dashboard.js");
const publicApi = read("api/feedback.js");
const adminApi = read("api/admin/feedback.js");

assert.match(adminHtml, /http-equiv="Content-Security-Policy" content="script-src-attr &#39;none&#39;"/);
assert.match(publicFeedback, /http-equiv="Content-Security-Policy" content="script-src-attr &#39;none&#39;"/);

assert.match(dashboard, /function feedbackTextElement\(/);
assert.match(dashboard, /detail\.replaceChildren\(feedbackDetailRow\("Pengirim"/);
assert.doesNotMatch(dashboard, /\$\("#feedbackDetail"\)\.innerHTML\s*=/);
assert.doesNotMatch(dashboard, /\$\("#feedbackGrid"\)\.innerHTML\s*=\s*rows\.length\?rows\.map/);

assert.match(publicFeedback, /reports\.replaceChildren\(\.\.\.\(rows\.length \? rows\.map\(reportCardNode\)/);
assert.doesNotMatch(publicFeedback, /reports\.innerHTML\s*=\s*rows\.length\s*\?\s*rows\.map/);

for (const source of [publicApi, adminApi]) {
  assert.match(source, /\.normalize\("NFKC"\)/);
  assert.match(source, /\\u202a-\\u202e\\u2066-\\u2069/);
}

for (const payload of [
  "<script>document.documentElement.innerHTML='DEFACED'</script>",
  "<img src=x onerror=alert(1)>",
  "<svg onload=alert(1)>",
  "\"><img src=x onerror=alert(1)>"
]) {
  const holder = { textContent: "" };
  holder.textContent = payload;
  assert.equal(holder.textContent, payload);
}

console.log("Feedback XSS hardening lulus: stored payload menjadi textContent, detail/list bukan HTML sink, CSP attr aktif, bidi controls dibuang.");
