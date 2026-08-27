"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const index = read("index.html");
const admin = read("admin/index.html");
const login = read("admin/login.html");
const css = read("assets/css/admin.css");
const coreCss = read("assets/css/core.css");
const performanceJs = read("assets/js/core/performance.js");
const loginJs = read("assets/js/admin/login.js");
const dashboardJs = read("assets/js/admin/dashboard.js");
const env = read(".env.example");
const readme = read("README.md");

assert.doesNotMatch(index, /id=["']splash["']|class=["'][^"']*splash-screen/);
assert.doesNotMatch(coreCss, /\.splash-screen\b|\.splash-title\b|\.splash-sub\b|\.nx-boot-label\b|\.nx-ring\b|\.nx-orb\b|\.nx-bar-wrap\b|\.nx-bar-fill\b|\.nx-status\b|@keyframes\s+nxSplashOut|@keyframes\s+nxTitleIn/);
assert.doesNotMatch(performanceJs, /removeSplash|document\.getElementById\(["']splash["']\)/);
assert.doesNotMatch(admin, /id=["']adminLoader["']|class=["'][^"']*admin-loader/);
assert.doesNotMatch(css, /\.admin-loader\b|Memverifikasi sesi admin/);
assert.doesNotMatch(loginJs, /fa-spinner|Memverifikasi\.\.\.|function\s+setLoading/);
assert.doesNotMatch(dashboardJs, /adminLoader|Memuat ulang dashboard/);
assert.match(dashboardJs, /adminBootFailure/);
assert.match(loginJs, /submit\.disabled=true/);
assert.match(loginJs, /location\.replace\("\/admin"\)/);
assert.match(login, /adminLoginForm/);
assert.match(env, /^GEMINI_API_KEY=/m);
assert.match(env, /^GEMINI_MODEL=/m);
assert.match(readme, /57 tool/);
assert.match(readme, /Node\.js 20 atau lebih baru/);

console.log("HF12 loading cleanup regression lulus: startup splash dan loader login/dashboard dihapus tanpa melemahkan autentikasi, recovery tetap tersedia, dan konfigurasi Personal AI terdokumentasi.");
