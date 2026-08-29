"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/css/admin-redesign.css"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "assets/js/admin/dashboard.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let braceDepth = 0;
for (const character of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
  if (character === "{") braceDepth += 1;
  if (character === "}") braceDepth -= 1;
  assert(braceDepth >= 0, "CSS admin memiliki kurung penutup berlebih.");
}
assert(braceDepth === 0, "CSS admin memiliki blok yang belum ditutup.");

const bottomNavigation = html.match(/<nav class="admin-bottom-nav"[\s\S]*?<\/nav>/)?.[0] || "";
assert((bottomNavigation.match(/<button/g) || []).length === 5, "Bottom navigation mobile harus memiliki lima menu primer.");
assert(html.indexOf("visual-qa.css") < html.indexOf("admin-redesign.css"), "Stylesheet mobile-first harus menjadi lapisan admin terakhir.");
assert(html.includes('id="toolFilterToggle"') && html.includes('id="toolFilterControls"'), "Kontrol filter tool mobile tidak lengkap.");

assert(css.includes("grid-template-columns: repeat(2, minmax(0, 1fr)) !important"), "Statistik mobile belum memakai grid dua kolom.");
assert(css.includes("min-height: 104px !important"), "Statistik mobile belum cukup padat.");
assert(css.includes("calc(78px + env(safe-area-inset-bottom))"), "Konten belum menghindari bottom navigation dan safe area.");
assert(css.includes(".admin-bottom-nav") && css.includes("grid-template-columns: repeat(5, minmax(0, 1fr)) !important"), "Bottom navigation mobile belum aktif atau belum lima kolom.");
assert(css.includes("backdrop-filter: none"), "Optimasi blur mobile/admin belum diterapkan.");
assert(!/@media\s*\(max-width:\s*370px\)[\s\S]{0,300}\.metric-grid\s*\{[^}]*grid-template-columns:\s*1fr/.test(css), "Statistik 360px tidak boleh turun menjadi satu kolom.");

const iconMapMatch = dashboard.match(/const ADMIN_TOOL_ICONS=Object\.freeze\((\{[\s\S]*?\})\);/);
assert(iconMapMatch, "Peta ikon tool admin tidak ditemukan.");
const iconMap = Function(`"use strict";return (${iconMapMatch[1]});`)();
const icons = Object.values(iconMap);
assert(Object.keys(iconMap).length === 61, "Seluruh 61 tool bawaan harus memiliki ikon admin.");
assert(new Set(icons).size === icons.length, "Ikon tool bawaan di admin harus unik.");
assert(iconMap.autopdf === "fa-solid fa-file-pdf", "Nexora Auto PDF harus memakai ikon PDF.");
assert(dashboard.includes("resolveAdminToolIcon(item)"), "Renderer kartu belum menggunakan resolver ikon berprioritas.");
assert(dashboard.includes("Ubah teks panjang menjadi PDF yang rapi."), "Copy Nexora Auto PDF belum diperbaiki.");
assert(dashboard.includes('class="tool-card-head"') && dashboard.includes('class="tool-card-footer"'), "Struktur kartu tool compact belum digunakan.");

console.log("Admin mobile-first lulus: stats 2 kolom, bottom nav, filter ringkas, kartu compact, 61 ikon unik, dan safe-area tervalidasi.");
