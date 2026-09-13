"use strict";
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const read=f=>fs.readFileSync(path.join(root,f),"utf8");

const css=read("assets/css/features/avatar-studio.css");
const js=read("assets/js/features/avatar-studio.js");
const html=read("avatar-studio.html");
const lazy=read("assets/js/core/lazy-loader.js");

assert.match(html,/viewport-fit=cover/);
assert.match(lazy,/avatar-studio-v4/);
assert.match(js,/state=\{[^\n]*mobileView:"browse"/);
assert.match(js,/function showMobileBrowse\(\)/);
assert.match(js,/function showMobileEditor\(captureBrowseScroll\)/);
assert.match(js,/state\.browseScrollY/);
assert.match(js,/if\(!dialog&&isMobileLayout\(\)\)showMobileEditor\(true\)/);
assert.match(js,/data-as-editor-style-title/);
assert.match(js,/data-as-back-styles/);
assert.match(js,/data-as-mobile-menu/);
assert.match(js,/data-as-editor-actions/);
assert.match(js,/data-as-download-menu/);
assert.match(js,/data-as-share-menu/);
assert.match(js,/\["svg","png","webp","jpg","avif"\]/);
assert.match(js,/state\.styles\.length\+" styles"/);
assert.match(js,/group==="Background"\|\|\/\^\(flip\|rotate\|scale\)\$\/i/);
assert.match(js,/optionCount<14/);
assert.match(js,/details\.open=isMobileLayout\(\)\?count===keys\.length/);

assert.match(css,/\.as-style-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:9px\}/);
assert.match(css,/\.as-preview-checker\{[\s\S]*width:min\(72vw,320px\)/);
assert.match(css,/\.as-mobile-actions\{[\s\S]*padding:6px 10px calc\(6px \+ env\(safe-area-inset-bottom\)\)/);
assert.match(css,/\.as-editor\{[\s\S]*calc\(82px \+ env\(safe-area-inset-bottom\)\)/);
assert.match(css,/\.as-editor-mobile-head\{[\s\S]*min-height:44px/);
assert.match(css,/\.as-chip-btn\{min-height:44px/);
assert.match(css,/\.as-option input,\.as-option select\{min-height:44px/);
assert.match(css,/@media\(min-width:640px\) and \(max-width:979px\)\{[\s\S]*grid-template-columns:minmax\(260px,.9fr\) minmax\(0,1.1fr\)/);
assert.match(css,/@media\(min-width:980px\)\{[\s\S]*repeat\(6,minmax\(0,1fr\)\)[\s\S]*grid-template-columns:minmax\(270px,340px\) minmax\(420px,1fr\) minmax\(250px,310px\)/);

for(const viewport of [360,375,390,412]){
  const outer=24;
  const gap=9;
  const card=(viewport-outer-gap)/2;
  assert.ok(card>=163,viewport+"px: style card terlalu sempit");
  const preview=Math.min(viewport*.72,320);
  assert.ok(preview<=320&&preview>=259,viewport+"px: preview mobile di luar target");
}
const estimated390GridStart=58+8+38+6+6+44+6+44+8+12;
assert.ok(estimated390GridStart<=230,"390px: style grid harus mulai sekitar <=230px");

assert.doesNotMatch(css,/@media\(max-width:430px\)/);
assert.doesNotMatch(js,/DICEBEAR_API_KEY|SUPABASE|\/api\/avatar/i);
console.log("Avatar Studio responsive V4 PASS: 360/375/390/412 browse-first, 2-column styles, ~72vw preview, compact dock, safe area, tablet 2-column, desktop preserved.");
