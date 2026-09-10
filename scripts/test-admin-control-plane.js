"use strict";

const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");

const helper=read("lib/admin-control-plane.js");
const account=read("lib/account-membership.js");
const dashboardApi=read("api/admin/dashboard.js");
const html=read("admin/index.html");
const adminJs=read("assets/js/admin/dashboard.js");
const functional=read("assets/js/admin/functional-audit.js");
const client=read("assets/js/admin/control-plane.js");
const middleware=read("middleware.js");

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
assert.match(middleware,/export default async function middleware/,"Vercel Routing Middleware harus terpasang");
assert.match(middleware,/PUBLIC_ACCESS_LOCKED/,"Routing Middleware harus mengembalikan global lock");
assert.match(middleware,/path\.startsWith\("\/admin\/"\)/,"dashboard admin harus dikecualikan dari global lock");
assert.match(middleware,/isAllowedStaticAsset/,"asset statis admin harus memakai allowlist sempit, bukan bypass seluruh /assets/");

async function routingLayerTest(){
  let fetchCalls=0;
  const source=middleware
    .replace(/export\s+default\s+async\s+function\s+middleware/,"async function middleware")
    + "\n;globalThis.__middleware=middleware;";
  const context={
    console:{error(){}},
    URL,
    Response,
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    process:{env:{
      SUPABASE_URL:"https://example.supabase.co",
      SUPABASE_SECRET_KEY:"sb_secret_test"
    }},
    fetch:async function(){
      fetchCalls+=1;
      return new Response(JSON.stringify([{value:{publicAccess:{locked:true,message:"Maintenance test"}}}]),{
        status:200,
        headers:{"content-type":"application/json"}
      });
    }
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:"middleware.js"});

  const publicResponse=await context.__middleware({
    url:"https://nexora.test/"
  });
  assert.equal(publicResponse.status,503,"Routing Middleware global harus memblokir HTML publik");
  assert.match(await publicResponse.text(),/Maintenance test/);

  const apiResponse=await context.__middleware({
    url:"https://nexora.test/api/health"
  });
  assert.equal(apiResponse.status,503,"Routing Middleware global harus memblokir API publik");
  assert.equal((await apiResponse.json()).error,"PUBLIC_ACCESS_LOCKED");

  const before=fetchCalls;
  const adminResponse=await context.__middleware({
    url:"https://nexora.test/admin"
  });
  assert.equal(adminResponse,undefined,"Admin harus tetap dapat dibuka untuk unlock");
  assert.equal(fetchCalls,before,"Admin bypass tidak boleh query lock");

  const assetResponse=await context.__middleware({
    url:"https://nexora.test/assets/css/admin.css"
  });
  assert.equal(assetResponse,undefined,"Asset CSS admin harus tetap tersedia");

  const assetJsResponse=await context.__middleware({
    url:"https://nexora.test/assets/js/admin/dashboard.js"
  });
  assert.equal(assetJsResponse,undefined,"Asset JS admin harus tetap tersedia");

  // Production bypass yang benar-benar ditemukan:
  // cleanUrls mengubah .../index.html -> .../quote-generator lalu V4 menganggap
  // seluruh /assets/ aman. V5 wajib menahan kedua bentuk.
  const standaloneClean=await context.__middleware({
    url:"https://nexora.test/assets/apps/quote-generator?v=standalone-v1"
  });
  assert.equal(standaloneClean.status,503,"Clean URL standalone app tidak boleh membypass global lock");
  assert.equal((await standaloneClean.text()).includes("Maintenance test"),true);

  const standaloneHtml=await context.__middleware({
    url:"https://nexora.test/assets/apps/quote-generator/index.html?v=standalone-v1"
  });
  assert.equal(standaloneHtml.status,503,"index.html standalone app tidak boleh membypass global lock");

  const comicReader=await context.__middleware({
    url:"https://nexora.test/assets/comic-reader/index"
  });
  assert.equal(comicReader.status,503,"Comic Reader standalone tidak boleh membypass global lock");

  const visualDemo=await context.__middleware({
    url:"https://nexora.test/assets/visuals/demos/Hex-grid"
  });
  assert.equal(visualDemo.status,503,"HTML visual demo tidak boleh membypass global lock");

  const arbitraryAssetDocument=await context.__middleware({
    url:"https://nexora.test/assets/unknown-document"
  });
  assert.equal(arbitraryAssetDocument.status,503,"Path /assets tanpa ekstensi statis aman harus diblokir");
}


routingLayerTest().then(()=>console.log("Admin Control Plane contract lulus: global routing lock V5 menutup standalone cleanUrls bypass, server lock, maintenance, audit linkage, CSRF, dan no-fake-progress.")).catch((error)=>{console.error(error);process.exit(1);});
