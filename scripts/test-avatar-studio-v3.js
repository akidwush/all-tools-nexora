"use strict";
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const read=f=>fs.readFileSync(path.join(root,f),"utf8");

const js=read("assets/js/features/avatar-studio.js");
const css=read("assets/css/features/avatar-studio.css");
const lazy=read("assets/js/core/lazy-loader.js");
const html=read("avatar-studio.html");
const index=read("index.html");

for(const token of [
  "galleryObservers=new WeakMap",
  "index<4",
  "IntersectionObserver",
  "Randomize Avatar",
  "/options.json",
  "/definition.json"
]) assert.ok(js.includes(token),`current Avatar Studio contract hilang: ${token}`);

assert.ok(css.includes("Avatar Studio V2.3 visual refinement"));
assert.ok(css.includes("@media(max-width:639px)"));
assert.ok(css.includes(".as-hero{display:none}"));
assert.ok(css.includes("width:min(88vw,540px)"));
assert.ok(css.includes("safe-area-inset-bottom"));

const avatar=index.indexOf('data-tool-id="avatarstudio"');
const terabox=index.indexOf('data-tool-id="terabox"');
assert.ok(avatar>=0,"Avatar Studio harus tampil pada dashboard publik");
assert.ok(terabox>=0&&avatar<terabox,"Avatar Studio harus tampil sebelum downloader utama");

assert.match(lazy,/avatar-studio-v3/);
assert.match(html,/avatar-studio3/);
assert.doesNotMatch(js,/DICEBEAR_API_KEY|SUPABASE|\/api\/avatar/i);

console.log("Avatar Studio V2.3 reconcile lulus: current observer dipertahankan, mobile preview-first, hero lama disembunyikan, dashboard pin aktif, cache v3.");
