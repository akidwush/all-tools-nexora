"use strict";

const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");

const helper=read("lib/admin-control-plane.js");
const account=read("lib/account-membership.js");
const dashboardApi=read("api/admin/dashboard.js");
const html=read("admin/index.html");
const adminJs=read("assets/js/admin/dashboard.js");
const functional=read("assets/js/admin/functional-audit.js");
const client=read("assets/js/admin/control-plane.js");

assert.match(helper,/PUBLIC_ACCESS_LOCKED/,"server-side public access lock harus ada");
assert.match(helper,/DATABASE_NOT_CONFIGURED[^\n]*return true/,"test/dev tanpa Supabase harus meneruskan ke authorization legacy, bukan memalsukan 503 Control Plane");
assert.match(helper,/TOOL_MAINTENANCE/,"server-side endpoint maintenance harus ada");
assert.match(helper,/requireAdmin\(request, response, \{ edit: true \}\)/,"mutasi Control Plane harus membutuhkan admin edit");
assert.match(helper,/verifyMutationRequest\(request\)/,"mutasi Control Plane harus memakai CSRF");
assert.match(helper,/recordAdminAudit/,"perubahan Control Plane harus masuk audit log");
assert.match(account,/enforceToolControlPlane/,"authorizeTool harus terhubung ke Control Plane");
assert.match(account,/await enforceToolControlPlane\(request, response, toolId\)/,"enforcement harus terjadi pada request server");
assert.match(dashboardApi,/searchParams\.get\("mode"\) === "control-plane"/,"Control Plane harus memakai function admin yang sudah ada");
assert.match(html,/data-panel="control"/,"panel Admin Control Plane harus terpasang");
assert.match(html,/admin-control-plane\.css/,"CSS Control Plane harus dimuat");
assert.match(html,/control-plane\.js/,"client Control Plane harus dimuat");
assert.match(adminJs,/control:"Admin Control Plane"/,"heading Control Plane harus terdaftar");
assert.doesNotMatch(functional,/progressTimer\s*=\s*setInterval/,"Functional Audit tidak boleh memakai progress timer palsu");
assert.match(client,/\/api\/admin\/dashboard\?mode=control-plane/,"client harus memakai API admin nyata");
assert.doesNotMatch(client,/Math\.random|mockStatus|fakeMetric/i,"Control Plane tidak boleh menghasilkan fake metric/status");

console.log("Admin Control Plane contract lulus: server lock, maintenance, audit linkage, CSRF, dan no-fake-progress.");
