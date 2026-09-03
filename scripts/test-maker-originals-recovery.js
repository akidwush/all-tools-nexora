"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { handleMakerOriginal, normalizeClock, providerCandidates, financialSimulationSvg } = require("../lib/maker-originals");
const policy = require("../lib/server-access-policy");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const config = require(path.join(root, "assets/config.js"));
const manifest = JSON.parse(read("assets/module-manifest.json"));
const IDS = ["brat","iqc","fakebankjago","fakedana","fakeovo","fakedev","sertifikat","tanyaustadz"];

for (const id of IDS) {
  assert.equal(manifest.tools[id], "maker-originals", `${id} harus memakai maker-originals`);
  assert.ok(policy.SERVER_AUTHORIZED_TOOL_IDS.includes(id), `${id} harus server-authorized`);
  const tool = Object.values(config.tools).flat().find((item) => item.id === id);
  assert.equal(tool.runtime.module, "maker-originals");
  assert.equal(tool.runtime.mode, "api");
}
assert.equal(manifest.modules["maker-originals"].js[0], "assets/js/features/maker-originals.js");
assert.equal(manifest.modules["maker-originals"].css[0], "assets/css/features/maker-originals.css");

const client = read("assets/js/features/maker-originals.js");
assert.match(client, /window\.renderFakeOvo=function\(body\)\{render\('fakeovo',body\);\}/);
assert.match(client, /mode:'maker-original'/);
assert.doesNotMatch(client, /nxBuildFakeBankJagoLocal|nxBuildFakeDevFallback|localBrat|api\.allorigins\.win/);
assert.match(client, /BUKAN BUKTI TRANSAKSI/);

const api = read("api/tool-health.js");
assert.match(api, /handleMakerOriginal/);
assert.match(api, /mode"\) === "maker-original"/);

assert.equal(normalizeClock("12"), "12:00");
assert.equal(normalizeClock("07:35"), "07:35");
assert.equal(normalizeClock("99"), "23:00");

const fakeOvoCandidates = providerCandidates("fakeovo", new URL("https://nexora.local/api/tool-health?mode=maker-original&tool=fakeovo&nominal=12000"));
assert.equal(fakeOvoCandidates[0].provider, "Keyra");
assert.match(fakeOvoCandidates[0].url, /\/maker\/fake-ovo\?nominal=12000/);

const iqcCandidates = providerCandidates("iqc", new URL("https://nexora.local/api/tool-health?mode=maker-original&tool=iqc&text=Hello&provider=INDOSAT&jam=9&baterai=51"));
assert.match(iqcCandidates[0].url, /\/maker\/iqcv1/);
assert.match(iqcCandidates[0].url, /jam=09%3A00/);

function responseMock(){
  const headers={};
  return {
    headers,
    statusCode:0,
    body:null,
    setHeader(k,v){headers[String(k).toLowerCase()]=v;},
    getHeader(k){return headers[String(k).toLowerCase()];},
    status(code){this.statusCode=code;return this;},
    json(payload){this.body=payload;return this;},
    send(payload){this.body=payload;return this;},
    end(payload){this.body=payload||this.body;return this;}
  };
}

(async()=>{
  const png=Buffer.from("89504e470d0a1a0a", "hex");
  const request={method:"GET",headers:{host:"nexora.local"}};
  const response=responseMock();
  const url=new URL("https://nexora.local/api/tool-health?mode=maker-original&tool=brat&text=hello");
  await handleMakerOriginal(request,response,url,{
    fetchImpl:async()=>new Response(png,{status:200,headers:{"content-type":"image/png"}}),
    assertPublicUrlImpl:async(value)=>new URL(value)
  });
  assert.equal(response.statusCode,200);
  assert.equal(response.headers["x-nexora-maker-original"],"1");
  assert.equal(response.headers["x-nexora-maker-provider"],"Keyra");
  assert.deepEqual(response.body,png);

  const financial=financialSimulationSvg({buffer:png,contentType:"image/png"},"fakedana");
  assert.match(financial.buffer.toString("utf8"),/SIMULASI \/ PRANK/);
  assert.match(financial.buffer.toString("utf8"),/BUKAN BUKTI TRANSAKSI/);

  const failResponse=responseMock();
  await handleMakerOriginal(request,failResponse,new URL("https://nexora.local/api/tool-health?mode=maker-original&tool=sertifikat&text=Test"),{
    fetchImpl:async()=>new Response(JSON.stringify({error:{message:"offline"}}),{status:503,headers:{"content-type":"application/json"}}),
    assertPublicUrlImpl:async(value)=>new URL(value)
  });
  assert.equal(failResponse.statusCode,502);
  assert.match(failResponse.body.message,/tidak mengganti hasil dengan template lokal palsu/i);

  console.log("Maker Originals Recovery lulus: routing Fake OVO benar, provider original server-side, IQC dinormalisasi, fallback lokal palsu dihapus dari jalur aktif, dan simulasi finansial diberi watermark permanen.");
})().catch((error)=>{console.error(error);process.exit(1);});
