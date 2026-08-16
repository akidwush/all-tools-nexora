const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function assertBalancedCss(file) {
  const source = read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
  let depth = 0;
  for (const character of source) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    assert.ok(depth >= 0, `${file}: kurung CSS tertutup terlalu awal`);
  }
  assert.equal(depth, 0, `${file}: kurung CSS tidak seimbang`);
}

const components = read("assets/css/components.css");
assert.match(components, /#nxUniversalRoom,\s*#nxUniversalRoom \*,\s*#nxUniversalRoom \*::before,\s*#nxUniversalRoom \*::after\{box-sizing:border-box\}/);
assert.match(components, /#nxUniversalRoom \.nx-room-scroll\{[\s\S]*?overflow-x:hidden;[\s\S]*?overflow-y:auto;/);
assert.match(components, /#nxUniversalRoom \.nx-room-shell,[\s\S]*?#nxUniversalRoom \.nx-room-tool-body\{[\s\S]*?min-width:0;[\s\S]*?max-width:100%;/);
assert.ok(components.includes(".nx-room-tool-body :where(*){min-width:0;max-width:100%}"));
assert.match(components, /@keyframes nxRoomEnter\{[\s\S]*?to\{opacity:1;transform:none\}/);
assert.doesNotMatch(components, /@keyframes nxRoomEnter\{[\s\S]*?to\{[^}]*scale\(1\)/);

const admin = read("assets/css/admin.css");
for (const token of [
  ".admin-login-page{grid-template-columns:minmax(0,1fr);width:100%;min-width:0;overflow-x:hidden}",
  ".login-shell{width:100%;max-width:450px;min-width:0}",
  "@media(max-width:480px)",
  ".login-card{padding:20px 17px;border-radius:22px}"
]) assert.ok(admin.includes(token), `Admin Login kehilangan guard: ${token}`);
assert.ok(read("admin/login.html").includes("assets/css/admin.css?v=6.3.18"));
assert.ok(read("admin/index.html").includes("assets/css/admin.css?v=6.3.18"));

const crypto = read("assets/css/features/crypto-market.css");
for (const token of [
  ".nx-crypto,.nx-crypto *,.nx-crypto *::before,.nx-crypto *::after{box-sizing:border-box}",
  ".nx-crypto{width:100%;max-width:100%;min-width:0;overflow-x:clip}",
  ".nx-crypto-controls>*{min-width:0;max-width:100%}",
  ".nx-crypto-provider{flex-wrap:wrap;overflow-wrap:anywhere}"
]) assert.ok(crypto.includes(token), `Crypto Market kehilangan guard: ${token}`);

const intelligence = read("assets/css/features/web-intelligence.css");
for (const token of [
  "overflow-x:clip",
  ".nwi-url-field>*{min-width:0;max-width:100%}",
  ".nwi-launch-copy h2,.nwi-launch-copy h2 em,.nwi-launch-copy>p{max-width:100%;overflow-wrap:anywhere}",
  "font-size:clamp(25px,8.3vw,32px)"
]) assert.ok(intelligence.includes(token), `Web Intelligence kehilangan guard: ${token}`);

const spaceCss = read("assets/css/features/space-explorer.css");
const spaceUi = read("assets/js/features/space-explorer.js");
for (const token of [
  ".nse{min-width:0;max-width:100%;overflow-x:clip}",
  "max-height:calc(100dvh - max(56px,env(safe-area-inset-top)))",
  ".nse-modal-close{top:max(8px,env(safe-area-inset-top));right:10px;bottom:auto}"
]) assert.ok(spaceCss.includes(token), `Space Explorer kehilangan guard: ${token}`);
assert.ok(spaceUi.includes("document.body.appendChild(modal);"), "Modal Space Explorer harus dipindahkan ke body");
assert.ok(spaceUi.includes("modal.remove();"), "Modal portal harus dibersihkan saat room ditutup");

for (const file of [
  "assets/css/components.css",
  "assets/css/admin.css",
  ...fs.readdirSync(path.join(root, "assets/css/features"))
    .filter((name) => name.endsWith(".css"))
    .map((name) => `assets/css/features/${name}`)
]) assertBalancedCss(file);

const index = read("index.html");
const loader = read("assets/js/core/lazy-loader.js");
assert.ok(index.includes("assets/css/components.css?v=6.3.18-hf8-public-controls1"));
assert.match(loader, /ASSET_VERSION = '6\.3\.18'/);

console.log("Mobile Layout HF7 tests lulus: room containment global, Admin Login, Crypto Market, Web Intelligence, Space modal portal, CSS balance, dan cache bust aktif.");
