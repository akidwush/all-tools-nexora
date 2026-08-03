const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
let failed = false;
function fail(message){ console.error(message); failed = true; }
function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    const full=path.join(dir,entry.name);
    if(entry.name==="node_modules"||entry.name==="public"||entry.name===".git") return [];
    return entry.isDirectory()?walk(full):[full];
  });
}
for(const filename of ["index.html","about.html","feedback.html"]){
  const source=fs.readFileSync(path.join(root,filename),"utf8");
  if(!/<\/html>\s*$/i.test(source)) fail(`${filename}: penutup HTML tidak valid.`);
  let scriptIndex=0;
  for(const match of source.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)){
    scriptIndex++;
    if(/\bsrc\s*=/.test(match[1])) continue;
    if(filename==="index.html" && match[2].trim()) fail(`${filename}: masih memiliki JavaScript inline pada blok ${scriptIndex}.`);
    if(filename!=="index.html" && match[2].trim()){
      try{ new vm.Script(match[2],{filename:`${filename}:inline-${scriptIndex}`}); }
      catch(error){ fail(`${filename}: ${error.message}`); }
    }
  }
  if(filename==="index.html" && /<style\b/i.test(source)) fail("index.html masih memiliki CSS inline.");
}
const jsFiles=walk(root).filter((file)=>file.endsWith(".js"));
for(const file of jsFiles){
  const relative=path.relative(root,file);
  try{ new vm.Script(fs.readFileSync(file,"utf8"),{filename:relative}); }
  catch(error){ fail(`${relative}: ${error.message}`); }
}
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const indexBytes=Buffer.byteLength(index);
if(indexBytes>180000) fail(`index.html masih terlalu besar: ${indexBytes} byte.`);
for(const token of ["assets/css/core.css","assets/js/core/app.js","assets/js/core/tool-health.js","assets/js/core/lazy-loader.js"]){
  if(!index.includes(token)) fail(`index.html belum merujuk aset modular: ${token}`);
}
if(!index.includes('id="nxToolHealth"')) fail("index.html belum memiliki panel tool health.");
const app=fs.readFileSync(path.join(root,"assets/js/core/app.js"),"utf8");
if(!app.includes('data-tool-id="${item.id}"')) fail("app.js belum memberi data-tool-id stabil pada kartu.");
const loader=fs.readFileSync(path.join(root,"assets/js/core/lazy-loader.js"),"utf8");
for(const token of ["ensureModule","toolModules","NexoraModules","get-code","nexus-ai"]){
  if(!loader.includes(token)) fail(`lazy-loader belum lengkap: ${token}`);
}
const getCode=fs.readFileSync(path.join(root,"assets/js/features/get-code.js"),"utf8");
for(const token of ["nxgcReport","analyzeExtractedSource","downloadSourceReport","runLiveAudit","LIVE_AUDIT_ENDPOINT","nxgcAssetScore"]){
  if(!getCode.includes(token)) fail(`Get Code module belum berisi ${token}`);
}

const auditApi=fs.readFileSync(path.join(root,"api/audit.js"),"utf8");
const auditLib=fs.readFileSync(path.join(root,"lib/audit.js"),"utf8");
for(const token of ["auditBatch","AUDIT_RATE_LIMITED","MAX_BODY_BYTES"]){ if(!auditApi.includes(token)) fail(`Audit API belum lengkap: ${token}`); }
for(const token of ["assertPublicUrl","PRIVATE_IP_BLOCKED","readHeadersWithRedirects","CORS_RISK","MIME_MISMATCH"]){ if(!auditLib.includes(token)) fail(`Audit library belum lengkap: ${token}`); }
const routeManifest=JSON.parse(fs.readFileSync(path.join(root,"route-manifest.json"),"utf8"));
if(!(routeManifest.apiRoutes||[]).includes("/api/audit")) fail("route-manifest belum mencantumkan /api/audit");
if(!(routeManifest.apiRoutes||[]).includes("/api/tool-health")) fail("route-manifest belum mencantumkan /api/tool-health");

const healthApi=fs.readFileSync(path.join(root,"api/tool-health.js"),"utf8");
const healthLib=fs.readFileSync(path.join(root,"lib/tool-health.js"),"utf8");
const healthUi=fs.readFileSync(path.join(root,"assets/js/core/tool-health.js"),"utf8");
for(const token of ["HEALTH_CHECK_TOKEN","refresh === \"force\"","executeRun","readCachedToolHealth"]){ if(!healthApi.includes(token.replaceAll('\\"','"'))) fail(`Tool health API belum lengkap: ${token}`); }
for(const token of ["TOOL_CATALOG","runToolHealthChecks","persistHealthResults","classifyProbe","summarizeHealth"]){ if(!healthLib.includes(token)) fail(`Tool health library belum lengkap: ${token}`); }
for(const token of ["nxToolHealth","/api/tool-health?refresh=auto","renderList","CACHE_KEY"]){ if(!healthUi.includes(token)) fail(`Tool health UI belum lengkap: ${token}`); }
const schema=fs.readFileSync(path.join(root,"database/schema.sql"),"utf8");
for(const token of ["create table if not exists public.tool_health","consecutive_failures","success_rate"]){ if(!schema.includes(token)) fail(`Schema tool health belum lengkap: ${token}`); }
if(!fs.existsSync(path.join(root,"database/migrations/002_tool_health.sql"))) fail("Migration tool health belum tersedia.");
const healthCatalog=require(path.join(root,"lib/tool-health.js")).TOOL_CATALOG;
if(!Array.isArray(healthCatalog)||healthCatalog.length!==22) fail(`Tool health catalog harus memuat 22 tools, ditemukan ${healthCatalog?.length||0}.`);

const manifest=JSON.parse(fs.readFileSync(path.join(root,"assets/module-manifest.json"),"utf8"));
for(const [name,spec] of Object.entries(manifest.modules||{})){
  for(const asset of [...(spec.css||[]),...(spec.js||[])]){
    if(!fs.existsSync(path.join(root,asset))) fail(`Manifest ${name} menunjuk file hilang: ${asset}`);
  }
}
const scanFiles=walk(root).filter((file)=>/\.(?:html|js|css|json)$/i.test(file) && path.relative(root,file)!=="scripts/check-project.js");
const forbidden=["arguments.callee","api.telegram.org/bot","REPORT_FEEDBACK_B64","ABOUT_DEV_B64"];
for(const file of scanFiles){
  const source=fs.readFileSync(file,"utf8");
  for(const token of forbidden){ if(source.includes(token)) fail(`${path.relative(root,file)} masih berisi pola terlarang: ${token}`); }
  for(const match of source.matchAll(/["']([A-Za-z0-9+/]{160,}={0,2})["']/g)){
    try{
      const decoded=Buffer.from(match[1],"base64").toString("utf8");
      if(/api\.telegram\.org\/bot|\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/i.test(decoded)){
        fail(`${path.relative(root,file)} memuat kredensial layanan pesan di payload base64.`); break;
      }
    }catch{}
  }
}
if(failed) process.exit(1);
console.log(`Audit v4.2 lulus: index ${indexBytes.toLocaleString()} byte, ${jsFiles.length} file JS valid, lazy-load, live HTTP audit, dan tool health monitoring lengkap.`);
