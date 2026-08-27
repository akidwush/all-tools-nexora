"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const manifest = JSON.parse(read("assets/module-manifest.json"));
const routes = JSON.parse(read("route-manifest.json"));
const vercel = JSON.parse(read("vercel.json"));
const ui = read("assets/js/features/alight-premium.js");
const css = read("assets/css/features/alight-premium.css");
const local = read("serve-local.js");
const registry = read("assets/js/core/tool-registry.js");
const shell = read("assets/js/core/shell.js");
const app = read("assets/js/core/app.js");
const proxy = read("lib/alight-premium-proxy.js");

const magicSource = "/api/alight-premium/magic-link";
const applySource = "/api/alight-premium/apply-premium";
const magicDest = "/api/tool-health?mode=alight-premium&action=magic-link";
const applyDest = "/api/tool-health?mode=alight-premium&action=apply-premium";

assert.equal(manifest.tools.alightpremium, "alight-premium");
assert.ok(manifest.modules["alight-premium"].js.includes("assets/js/features/alight-premium.js"));
assert.ok(manifest.modules["alight-premium"].css.includes("assets/css/features/alight-premium.css"));

for (const route of ["/api/alight-premium", magicSource, applySource]) assert.ok(routes.apiRoutes.includes(route), `${route} harus ada di route-manifest`);
assert.ok(vercel.rewrites.some((row) => row.source === magicSource && row.destination === magicDest), "magic-link harus melewati protected server route");
assert.ok(vercel.rewrites.some((row) => row.source === applySource && row.destination === applyDest), "applyPremium harus melewati protected server route");
assert.ok(vercel.rewrites.some((row) => row.source === "/api/alight-premium" && /mode=alight-premium/.test(row.destination)), "health route Alight harus tetap tersedia");

assert.ok(ui.includes("var MAGIC_ROUTE='/api/alight-premium/magic-link'"));
assert.ok(ui.includes("var APPLY_ROUTE='/api/alight-premium/apply-premium'"));
assert.ok(ui.includes("method:'GET'"));
assert.ok(ui.includes("url.searchParams.set('email'"));
assert.ok(ui.includes("url.searchParams.set('link'"));
assert.ok(!ui.includes("method:'POST'"));
assert.ok(!ui.includes("https://api.kyzznekoo.my.id"), "browser tidak boleh fetch provider secara cross-origin");
assert.ok(!ui.includes("AbortController"));
assert.ok(ui.includes("function validEmail"));
assert.ok(ui.includes('placeholder="nama@email.com"'));
assert.ok(!ui.includes("validGmail"));
assert.ok(!ui.includes("@gmail.com"));

assert.ok(local.includes('"/api/alight-premium/magic-link"'));
assert.ok(local.includes('"/api/alight-premium/apply-premium"'));
assert.ok(local.includes("if (route.action) requestUrl.searchParams.set(\"action\", route.action);"));

assert.ok(proxy.includes('const https = require("node:https")'));
assert.ok(proxy.includes("family: 4"));
assert.ok(!proxy.includes("await fetch("));
assert.ok(!proxy.includes("AbortController"));
assert.ok(!proxy.includes("@gmail.com"));
assert.equal(require(path.join(root, "lib/alight-premium-proxy.js")).normalizeEmail("ellampremmm@fboxmail.com"), "ellampremmm@fboxmail.com");
assert.equal(require(path.join(root, "lib/alight-premium-proxy.js")).normalizeEmail("User.Name+tag@OUTLOOK.COM"), "User.Name+tag@outlook.com");
assert.throws(() => require(path.join(root, "lib/alight-premium-proxy.js")).normalizeEmail("email-tidak-valid"), /alamat email yang valid/i);
assert.match(read("assets/js/core/lazy-loader.js"), /alight-premium-hf30/);

assert.ok(ui.includes("renderAlightPremium"));
assert.ok(ui.includes("Apply Premium 1 Tahun"));
assert.ok(css.includes(".nap"));
assert.ok(registry.includes('["alightpremium","Alight Motion Premium 1 Tahun"'));
assert.ok(shell.includes("alightpremium:{renderer:'renderAlightPremium'"));
assert.ok(app.includes("id: 'alightpremium'"));
assert.ok(app.includes("case 'alightpremium': renderAlightPremium(body); break;"));

assert.ok(proxy.includes('productionTransport: "protected-server-route"'));
console.log("Alight Motion Premium protected-route tests lulus: browser tetap same-origin dan seluruh action melewati backend membership Nexora.");
