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
for(const token of ["assets/css/core.css","assets/js/core/app.js","assets/js/core/lazy-loader.js"]){
  if(!index.includes(token)) fail(`index.html belum merujuk aset modular: ${token}`);
}
const app=fs.readFileSync(path.join(root,"assets/js/core/app.js"),"utf8");
if(!app.includes('data-tool-id="${item.id}"')) fail("app.js belum memberi data-tool-id stabil pada kartu.");
const loader=fs.readFileSync(path.join(root,"assets/js/core/lazy-loader.js"),"utf8");
for(const token of ["ensureModule","toolModules","NexoraModules","get-code","nexus-ai"]){
  if(!loader.includes(token)) fail(`lazy-loader belum lengkap: ${token}`);
}
const getCode=fs.readFileSync(path.join(root,"assets/js/features/get-code.js"),"utf8");
for(const token of ["nxgcReport","analyzeExtractedSource","downloadSourceReport"]){
  if(!getCode.includes(token)) fail(`Get Code module belum berisi ${token}`);
}
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
console.log(`Audit v4 lulus: index ${indexBytes.toLocaleString()} byte, ${jsFiles.length} file JS valid, manifest lazy lengkap.`);
