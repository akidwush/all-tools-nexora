"use strict";
const assert=require("node:assert/strict");
const BASE="https://api.dicebear.com/10.x";
const FALLBACK=["lorelei","adventurer","avataaars","bottts","pixel-art","identicon","initials","shapes"];
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
async function request(url,accept="*/*",tries=2){let last;for(let i=0;i<=tries;i++){try{const response=await fetch(url,{headers:{Accept:accept,"User-Agent":"Nexora-Avatar-Studio-Real-Test/1.0"}});if(response.status===429&&i<tries){const retry=Number(response.headers.get("retry-after"));await wait(Number.isFinite(retry)?Math.min(8000,retry*1000):500*(2**i));continue;}return response;}catch(error){last=error;if(i<tries)await wait(500*(2**i));}}throw last;}
(async()=>{
  const root=await request(BASE+"/","application/json");assert.equal(root.ok,true,`style discovery HTTP ${root.status}`);const discovery=await root.json();assert.ok(Array.isArray(discovery.styles)&&discovery.styles.length>=FALLBACK.length,"style discovery kosong");const styles=discovery.styles.map(String);for(const style of FALLBACK)assert.ok(styles.includes(style),`fallback style ${style} tidak ditemukan`);const style=styles.includes("lorelei")?"lorelei":styles[0];
  const options=await request(`${BASE}/${style}/options.json`,"application/json");assert.equal(options.ok,true,`options.json HTTP ${options.status}`);const schema=await options.json();assert.ok(schema&&typeof schema==="object"&&!Array.isArray(schema));
  const definition=await request(`${BASE}/${style}/definition.json`,"application/json");assert.equal(definition.ok,true,`definition.json HTTP ${definition.status}`);assert.ok((await definition.json())&&true);
  const seed=encodeURIComponent("Nexora Deterministic"),svgUrl=`${BASE}/${style}/svg?seed=${seed}`;const svg1=await request(svgUrl,"image/svg+xml"),svg2=await request(svgUrl,"image/svg+xml");assert.equal(svg1.ok,true);assert.equal(svg2.ok,true);const body1=await svg1.text(),body2=await svg2.text();assert.equal(body1,body2,"SVG tidak deterministic");assert.match(body1,/<svg/i);
  const png=await request(`${BASE}/${style}/png?seed=${seed}&size=128`,"image/png");assert.equal(png.ok,true,`PNG HTTP ${png.status}`);assert.match(png.headers.get("content-type")||"",/image\/png/i);
  for(const format of ["jpg","webp","avif","json"]){const r=await request(`${BASE}/${style}/${format}?seed=${seed}`);assert.equal(r.ok,true,`${format} HTTP ${r.status}`);}
  const bad=await request(`${BASE}/nexora-style-does-not-exist/svg?seed=x`);assert.ok(bad.status>=400,"invalid style seharusnya ditolak");
  const u1=new URL(`${BASE}/${style}/svg`);u1.searchParams.set("seed","Same");u1.searchParams.set("flip","true");const u2=new URL(`${BASE}/${style}/svg`);u2.searchParams.set("seed","Same");u2.searchParams.set("flip","true");assert.equal(u1.toString(),u2.toString());
  console.log(JSON.stringify({ok:true,version:"10.x",styleCount:styles.length,styleDiscovery:"dynamic",optionsJson:"working",definitionJson:"working",formats:["svg","png","jpg","webp","avif","json"],deterministic:true},null,2));
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
