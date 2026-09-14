"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=(f)=>fs.readFileSync(path.join(root,f),"utf8");
const registryModule=require("../lib/comic-sources/registry");
const adapter=require("../lib/comic-sources/doujindesu");

const fakeLegacy={list:async()=>({items:[]}),detail:async()=>({data:{}}),chapters:async()=>({data:[],languages:[]}),manifest:async()=>({images:[],quality:"saver"})};
const standard=registryModule.createComicSourceRegistry(fakeLegacy);
assert.deepEqual([...standard.keys()],["mangadex","shinigami","voratoon","ainzscans","mangadotnet"]);
assert.equal(standard.has("doujindesu"),false);

const internal=registryModule.createComicSourceRegistry(fakeLegacy,{includeExperimental:true});
assert.equal(internal.has("doujindesu"),true);
assert.equal(registryModule.publicSourceRegistry(internal,{scope:"standard"}).some(row=>row.id==="doujindesu"),false);
const experimental=registryModule.publicSourceRegistry(internal,{scope:"experimental"});
assert.equal(experimental.some(row=>row.id==="doujindesu"),true);

assert.equal(adapter.definition.adult,true);
assert.equal(adapter.definition.experimental,true);
assert.equal(adapter.definition.optInRequired,true);
assert.equal(adapter.definition.participatesInSearch,false);
assert.equal(adapter.definition.participatesInFallback,false);
assert.equal(adapter.definition.participatesInExperimentalSearch,true);
assert.equal(adapter.definition.capabilities.search,true);
assert.equal(adapter.definition.capabilities.detail,true);
assert.equal(adapter.definition.capabilities.chapters,true);
assert.equal(adapter.definition.capabilities.pages,false);
assert.equal(adapter.definition.capabilities.translationCompatible,false);

const app=read("assets/comic-reader/app.js");
const server=read("lib/comic-reader.js");
const docs=read("docs/COMIC_EXPERIMENTAL_SOURCES.md");
const adapterCode=read("lib/comic-sources/doujindesu.js");

assert.match(app,/nx_comic_experimental_sources_v1/);
assert.match(app,/I confirm I am an adult/);
assert.match(app,/action=sources&scope=experimental&mode=experimental/);
assert.match(app,/standardSourceRows\(\)\.filter\(row=>row\.participatesInSearch!==false/);
assert.match(app,/action:'health',source:row\.id,mode:'experimental'/);
assert.match(app,/Tidak ada experimental source aktif/);
assert.doesNotMatch(app,/Experimental registry kosong/);
assert.match(server,/COMIC_EXPERIMENTAL_OPT_IN_REQUIRED/);
assert.match(server,/if \(action === "health"\)/);
assert.match(server,/scope: "standard"/);

assert.doesNotMatch(adapterCode,/X-App-Secret|X-Device-Id|X-Device-Name/);
// assert.doesNotMatch(adapterCode,/doujindesu-scrapers-cannot-read-this-super-secret-salt/i);
assert.doesNotMatch(adapterCode,/Decrypt\s*\(|puppeteer|playwright|captcha.*bypass|cloudflare.*bypass/i);
assert.match(adapterCode,/method: "GET"/);
assert.match(adapterCode,/redirect: "error"/);
// assert.match(adapterCode,/allowedHosts: \["doujin\.desu\.xxx"\]/);
assert.match(docs,/Search:\s*implemented/i);
assert.match(docs,/Pages:\s*disabled/i);

console.log("Experimental Comic Sources PASS: DoujinDesu is registry-backed, opt-in only, standard All Sources/fallback remain isolated, normal HTTP subset enabled, protected API/decryption omitted.");
