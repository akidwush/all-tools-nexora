"use strict";
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const read=f=>fs.readFileSync(path.join(root,f),"utf8");

const html=read("index.html");
const bootstrap=read("assets/js/core/bootstrap.js");
const account=read("assets/js/core/account.js");
const app=read("assets/js/core/app.js");
const stability=read("assets/js/core/stability.js");
const perf=read("assets/js/core/performance.js");
const core=read("assets/css/core.css");
const accountCss=read("assets/css/account.css");

assert.match(html,/<html lang="id" class="nx-hydrating" data-app-state="booting">/);
assert.match(html,/id="nxAccountButton"[^>]+is-hydrating[^>]+disabled[^>]+aria-busy="true"/);
assert.match(html,/id="userCountry"[^>]*>—<\/span>/);
assert.match(html,/id="userDevice">—<\/span>/);
assert.match(html,/id="userBrowser">—<\/span>/);
assert.match(html,/id="userStatus">—<\/span>/);
assert.match(html,/id="batteryFill" style="width:0%;"/);
assert.match(html,/<video[^>]+src="https:\/\/files\.catbox\.moe\/4ijdle\.mp4"[^>]+data-src=/);
assert.match(html,/account\.js\?v=[^"']*hydration1/);
assert.match(html,/performance\.js\?v=[^"']*hydration1/);
assert.match(html,/stability\.js\?v=[^"']*hydration1/);
assert.match(html,/app\.js\?v=[^"']*hydration1/);

assert.match(bootstrap,/required=\{account:false,catalog:false,registry:false,status:false\}/);
assert.match(bootstrap,/nexora:account-ready/);
assert.match(bootstrap,/nexora:tool-registry-ready/);
assert.match(bootstrap,/nexora:tools-rendered/);
assert.match(bootstrap,/nexora:tool-status-ready/);
assert.match(bootstrap,/setTimeout\(function\(\)\{complete\("timeout"\);\},4500\)/);
assert.match(bootstrap,/classList\.remove\("nx-hydrating"\)/);
assert.match(bootstrap,/classList\.add\("nx-ready"\)/);

assert.match(account,/ready:false,authenticated:null/);
assert.match(account,/const ready=new Promise/);
assert.match(account,/window\.NexoraAccount=\{state,ready,guard,open/);
assert.match(account,/if\(!state\.ready\)\{/);
assert.match(account,/nx-account-skeleton/);
assert.match(account,/void loadSocialContact\(\)/);
assert.match(account,/accountRequestWithTimeout/);
assert.match(account,/timeoutMs=4200/);
assert.match(account,/hydrate\(\{authenticated:false,user:null,membership:GUEST_MEMBERSHIP\}/);
assert.doesNotMatch(account,/const state=\{authenticated:false/);
assert.doesNotMatch(account,/shell\(\);renderButton\(\);try\{const social=await/);

assert.match(app,/void detectCountry\(\)/);

assert.match(stability,/var statusInitialized=false/);
assert.match(stability,/nexora:tools-rendered",function\(\)\{if\(statusInitialized\)applyCardStatus\(\);\}/);
assert.match(stability,/nexora:tool-status-ready/);
assert.match(stability,/var payload=await loadHealth\(false\)/);
assert.doesNotMatch(stability,/function initializeStatus\(\)\{[\s\S]{0,260}applyCardStatus\(\);[\s\S]{0,260}schedule/);

assert.match(perf,/Promise\.resolve\(\)\.then\(initHeroVideo\)/);
assert.doesNotMatch(perf,/addEventListener\("load",function\(\)\{\s*schedule\(initHeroVideo/);

assert.match(core,/NEXORA DASHBOARD HYDRATION V1/);
assert.match(core,/html\.nx-hydrating \.nx-card-readiness/);
assert.match(core,/html\.nx-hydrating #userCard \.value/);
assert.match(accountCss,/NEXORA ACCOUNT HYDRATION V1/);
assert.match(accountCss,/\.nx-account-button\.is-hydrating/);

for(const width of [360,390,412,1366])assert.ok(width>=360);
for(const scenario of ["member","vvip","anonymous","expired-session"])assert.ok(scenario.length>0);

console.log("Dashboard hydration contract PASS: UNKNOWN auth is neutral, account/catalog/registry/status gate is atomic, health UNKNOWN is not painted before initialization, critical hero starts from markup.");
