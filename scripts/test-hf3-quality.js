"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");

const app = read("assets/js/core/app.js");
const parserStart = app.indexOf("function nxEvaluateMathExpression");
const parserEnd = app.indexOf("\n\nfunction renderCalc", parserStart);
assert(parserStart >= 0 && parserEnd > parserStart, "parser kalkulator harus tersedia");
const parserSource = app.slice(parserStart, parserEnd);
const evaluateMath = new Function(`${parserSource}; return nxEvaluateMathExpression;`)();
assert.equal(evaluateMath("(50*2)+20"), 120);
assert.equal(evaluateMath("2^3^2"), 512);
assert.equal(evaluateMath("-2^2"), -4);
assert.equal(evaluateMath("10 % 4 + 1,5"), 3.5);
assert.throws(() => evaluateMath("alert(1)"));
assert.throws(() => evaluateMath("1/0"));
assert.doesNotMatch(app, /Function\('\"use strict\"; return \('/);
assert.match(app, /cryptoApi\.getRandomValues\(bytes\)/);
assert.doesNotMatch(app.slice(app.indexOf("function renderPwgen"), app.indexOf("function renderMorse")), /Math\.random/);

const performance = read("assets/js/core/performance.js");
for (const token of [
  "/api/database?resource=settings",
  "HERO_SETTINGS_TIMEOUT_MS=1800",
  "heroConfig.enabled?heroMode:\"disabled\"",
  "nx-hero-video-disabled",
  "localStorage.setItem(HERO_SETTINGS_CACHE_KEY"
]) assert(performance.includes(token), `performance.js harus memuat ${token}`);

const adminHtml = read("admin/index.html");
const adminJs = read("assets/js/admin/dashboard.js");
const adminApi = read("api/admin/dashboard.js");
for (const token of ["heroVideoSettingsForm", "heroVideoUrl", "heroVideoEnabled", "saveHeroVideoButton"]) {
  assert(adminHtml.includes(token), `dashboard harus memuat ${token}`);
}
for (const token of ["saveHeroVideoSettings", "method:\"PATCH\"", "heroSettingsDirty"]) {
  assert(adminJs.includes(token), `dashboard client harus memuat ${token}`);
}
for (const token of ["updateHeroVideo", "verifyMutationRequest", "INVALID_HERO_VIDEO_URL", "settings.hero_video.update", "resolution=merge-duplicates"]) {
  assert(adminApi.includes(token), `dashboard API harus memuat ${token}`);
}

const migration = read("database/migrations/016_hero_video_settings.sql");
for (const token of ["public.app_settings", "heroVideo", "is_public = true", "notify pgrst"]) {
  assert(migration.includes(token), `migration hero harus memuat ${token}`);
}

assert(adminHtml.includes("dashboard.js?v=6.3.18-hf3"));
assert(read("index.html").includes("performance.js?v=6.3.18-lr4"));
assert(read("index.html").includes("app.js?v=6.3.18-lr4"));

console.log("Nexora HF3 quality tests lulus: kalkulator CSP-safe, password Web Crypto, video hero admin, cache bust, dan migration valid.");
