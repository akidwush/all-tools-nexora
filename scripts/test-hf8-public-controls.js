"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");
const html = read("index.html");
const core = read("assets/css/core.css");
const components = read("assets/css/components.css");
const socials = read("assets/js/core/social-links.js");
const shell = read("assets/js/core/shell.js");
const stability = read("assets/js/core/stability.js");
const ai = read("assets/js/core/personal-ai.js");
const aiCss = read("assets/css/personal-ai.css");

const footerBrand = html.indexOf('class="nx-footer-brand"');
const footerSocials = html.indexOf('id="nxFooterSocialLinks"');
assert.ok(footerBrand > 0 && footerSocials > footerBrand, "sosmed harus berada tepat setelah identitas footer");
assert.doesNotMatch(html, /nxTopMenuWhatsApp|nxTopMenuSocialLinks/);
assert.match(socials, /getElementById\("nxFooterSocialLinks"\)/);
assert.match(socials, /footerExcludedKeys = new Set\(\["whatsapp_access"\]\)/);
assert.match(socials, /host\.hidden = host\.childElementCount === 0/);
assert.match(core, /\.nx-footer-social-link\{/);

assert.match(html, /<aside[^>]+id="nx-wa-notif"[\s\S]*?<button[^>]+id="nx-wa-notif-close"[\s\S]*?<a[^>]+id="nx-wa-notif-link"/);
assert.doesNotMatch(html, /<a\s[^>]+id="nx-wa-notif"[\s\S]*?<button/);
assert.match(shell, /HF8: WhatsApp notification on desktop and touch devices/);
assert.doesNotMatch(shell, /shouldSuppress|maxTouchPoints|pointer: coarse/);
assert.match(shell, /showTimer=setTimeout/);
assert.match(shell, /closeButton\.addEventListener\('click'/);
assert.match(components, /#nx-wa-notif-link\{/);

assert.doesNotMatch(core + stability + html, /nxSafeReload|safeReload|nx_reload/);
assert.match(stability, /NexoraViewportRecovery=\{reconcile:reconcileScrollLock\}/);

for (const token of ["pointerdown", "pointermove", "setPointerCapture", "releasePointerCapture", "LAUNCHER_POSITION_KEY", "localStorage.setItem", "Math.hypot", "suppressClick", "positionLauncher", "syncPanelSide"]) {
  assert.equal(ai.includes(token), true, `drag Nexora AI harus memuat ${token}`);
}
assert.match(aiCss, /touch-action:none/);
assert.match(aiCss, /\.nx-ai-launcher\.has-custom-position\{right:auto!important;bottom:auto!important\}/);
assert.match(aiCss, /\.nx-ai-launcher\.is-dragging/);

for (const [name, source] of [["social-links", socials], ["shell", shell], ["stability", stability], ["personal-ai", ai]]) {
  assert.doesNotThrow(() => new Function(source), `${name}.js harus valid secara sintaks`);
}

console.log("HF8 public controls lulus: sosmed di footer, Refresh hilang, AI draggable persisten, dan popup WhatsApp aktif di HP.");
