"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const css = read("assets/css/admin-redesign.css");
const html = read("admin/index.html");
const dashboard = read("assets/js/admin/dashboard.js");
const members = read("assets/js/admin/members.js");

for (const token of [
  ".quick-actions {\n  display: grid",
  ".recent-activity-list { display: grid; }",
  ".member-toolbar {\n  display: grid",
  ".member-table-head {\n  display: grid",
  ".member-user {\n  display: flex",
  ".admin-skeleton-list { display: grid; }",
  ".member-detail-backdrop {\n  position: fixed",
  ".member-detail-drawer {\n  position: fixed",
  ".member-detail-drawer.is-open",
  ".member-detail-head {\n  position: sticky",
  ".member-detail-grid {\n  display: grid",
  ".member-action-row {\n  display: grid",
  ".member-danger-actions {\n  display: grid",
  "body.member-detail-open { overflow: hidden !important; }",
  ".admin-confirm-backdrop {\n  position: fixed"
]) assert(css.includes(token), `Structural admin rule hilang: ${token}`);

assert(/\.member-detail-backdrop\s*\{[\s\S]*?z-index:\s*90;/.test(css), "Backdrop member harus berada di atas bottom nav.");
assert(/\.member-detail-drawer\s*\{[\s\S]*?z-index:\s*100;/.test(css), "Drawer member harus berada di atas backdrop.");
assert(/\.admin-confirm-backdrop\s*\{[\s\S]*?z-index:\s*130;/.test(css), "Konfirmasi mutasi harus berada di atas drawer member.");
assert(dashboard.includes('new CustomEvent("nexora:admin-section-changed"'), "Dashboard belum mengirim lifecycle perubahan section.");
assert(members.includes('window.addEventListener("nexora:admin-section-changed"'), "Drawer member belum menutup saat pindah section.");
assert(members.includes('event.detail?.section!=="members"'), "Drawer member dapat tertinggal di section lain.");
assert(html.includes("admin-redesign.css?v=6.4.0-admin-member-hf1"), "Cache bust CSS admin hotfix belum aktif.");
assert(html.includes("dashboard.js?v=6.4.0-hf3-admin-member-hf1"), "Cache bust dashboard hotfix belum aktif.");
assert(html.includes("members.js?v=6.4.0-admin-member-hf1"), "Cache bust members hotfix belum aktif.");

console.log("Admin member drawer HF1 lulus: overlay, hierarchy, mobile layout, modal confirm, lifecycle section, dan cache bust tervalidasi.");
