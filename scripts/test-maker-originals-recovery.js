"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { handleMakerOriginal, providerCandidates, financialSimulationSvg, ALLOWED_TOOLS } = require('../lib/maker-originals');
const policy = require('../lib/server-access-policy');
const root = path.resolve(__dirname,'..');
const read = f => fs.readFileSync(path.join(root,f),'utf8');
const config = require(path.join(root,'assets/config.js'));
const manifest = JSON.parse(read('assets/module-manifest.json'));
const find = id => Object.values(config.tools).flat().find(x=>x.id===id);
const removedIds = ['fakebankjago','brat','iqc','fakedana','fakedev','tanyaustadz'];

assert.deepEqual([...ALLOWED_TOOLS].sort(), ['fakeovo','sertifikat']);
for(const id of ['fakeovo','sertifikat']){
  assert.equal(manifest.tools[id],'maker-originals');
  assert.ok(policy.SERVER_AUTHORIZED_TOOL_IDS.includes(id));
  assert.equal(find(id).runtime.module,'maker-originals');
}
for(const id of removedIds){
  assert.equal(find(id),undefined,`${id} harus hilang dari config`);
  assert.equal(manifest.tools[id],undefined,`${id} harus hilang dari manifest`);
  assert.equal(policy.SERVER_AUTHORIZED_TOOL_IDS.includes(id),false,`${id} harus hilang dari policy`);
}
assert.equal(fs.existsSync(path.join(root,'assets/js/features/stable-maker-local.js')),false);
assert.equal(fs.existsSync(path.join(root,'assets/css/features/stable-maker-local.css')),false);

const client = read('assets/js/features/maker-originals.js');
assert.match(client,/window\.renderFakeOvo=function\(body\)\{render\('fakeovo',body\);\}/);
assert.doesNotMatch(client,/renderFakeBankJago|renderFakeDana|renderFakeDev|renderTanyaUstadz|renderBrat|renderIqc/);

const fakeOvoCandidates = providerCandidates('fakeovo', new URL('https://nexora.local/api/tool-health?mode=maker-original&tool=fakeovo&nominal=12000'));
assert.equal(fakeOvoCandidates[0].provider,'Keyra');
assert.match(fakeOvoCandidates[0].url,/\/maker\/fake-ovo\?nominal=12000/);
const financial = financialSimulationSvg({buffer:Buffer.from('89504e470d0a1a0a','hex'),contentType:'image/png'});
const svg = financial.buffer.toString('utf8');
assert.match(svg,/>SIMULASI<\/text>/);
assert.doesNotMatch(svg,/SIMULASI \/ PRANK|BUKAN BUKTI TRANSAKSI/);

function responseMock(){const headers={};return{headers,statusCode:0,body:null,setHeader(k,v){headers[String(k).toLowerCase()]=v;},getHeader(k){return headers[String(k).toLowerCase()];},status(code){this.statusCode=code;return this;},json(payload){this.body=payload;return this;},send(payload){this.body=payload;return this;},end(payload){this.body=payload||this.body;return this;}};}
(async()=>{
  const png=Buffer.from('89504e470d0a1a0a','hex');
  const request={method:'GET',headers:{host:'nexora.local'}};
  const response=responseMock();
  await handleMakerOriginal(request,response,new URL('https://nexora.local/api/tool-health?mode=maker-original&tool=fakeovo&nominal=12000'),{
    fetchImpl:async()=>new Response(png,{status:200,headers:{'content-type':'image/png'}}),
    assertPublicUrlImpl:async(value)=>new URL(value)
  });
  assert.equal(response.statusCode,200);
  assert.equal(response.headers['x-nexora-simulation-watermark'],'minimal');
  assert.match(String(response.body),/SIMULASI/);
  for(const tool of removedIds){
    const removed=responseMock();
    await handleMakerOriginal(request,removed,new URL(`https://nexora.local/api/tool-health?mode=maker-original&tool=${tool}&nominal=1`));
    assert.equal(removed.statusCode,400);
  }
  console.log('Maker Hard-Prune lulus: 6 maker tidak stabil dibuang total; Fake OVO tetap original dengan penanda simulasi minimal.');
})().catch(e=>{console.error(e);process.exit(1);});
