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
  "mobileView:\"browse\"",
  "showMobileBrowse",
  "showMobileEditor",
  "openDownloadMenu",
  "openShareMenu",
  "data-as-back-styles",
  "data-as-download-menu",
  "data-as-share-menu",
  "/options.json",
  "/definition.json"
]) assert.ok(js.includes(token),`Avatar Studio V4 contract hilang: ${token}`);

assert.ok(css.includes("Avatar Studio V4 responsive layout"));
assert.ok(css.includes("@media(max-width:639px)"));
assert.ok(css.includes("@media(min-width:640px) and (max-width:979px)"));
assert.ok(css.includes("@media(min-width:980px)"));
assert.ok(css.includes(".as-app.as-mobile-browse .as-hero"));
assert.ok(css.includes(".as-app.as-mobile-editor .as-editor"));
assert.ok(css.includes("width:min(72vw,320px)"));
assert.ok(css.includes("calc(82px + env(safe-area-inset-bottom))"));
assert.equal((css.match(/@media\(max-width:639px\)/g)||[]).length,1,"mobile CSS harus punya satu canonical <=639 block");
assert.doesNotMatch(css,/@media\(max-width:430px\)/);
assert.doesNotMatch(css,/Avatar Studio V2\.3 visual refinement|Avatar Studio mobile polish/);

const avatar=index.indexOf('data-tool-id="avatarstudio"');
const terabox=index.indexOf('data-tool-id="terabox"');
assert.ok(avatar>=0,"Avatar Studio harus tampil pada dashboard publik");
assert.ok(terabox>=0&&avatar<terabox,"Avatar Studio harus tampil sebelum downloader utama");

assert.match(lazy,/avatar-studio-v4/);
assert.match(html,/avatar-studio4/);
assert.doesNotMatch(js,/DICEBEAR_API_KEY|SUPABASE|\/api\/avatar/i);
assert.doesNotMatch(js,/61\s+styles/i);

console.log("Avatar Studio V4 reconcile lulus: mobile discover-first, editor compact, dynamic DiceBear preserved, desktop >=980 contract retained.");
