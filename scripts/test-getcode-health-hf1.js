const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const health = read("lib/tool-health.js");
const stability = read("assets/js/core/stability.js");
const lazy = read("assets/js/core/lazy-loader.js");
const index = read("index.html");

assert.match(health, /id: "getcode"[\s\S]*?path: "\/assets\/js\/features\/get-code\.js"[\s\S]*?method: "HEAD"/);
assert.doesNotMatch(health, /id: "getcode"[\s\S]{0,280}?path: "\/api\/audit"[\s\S]{0,120}?method: "OPTIONS"/);
assert.match(stability, /meta&&meta\.mode==="module"&&raw==="offline"\) return "degraded"/);
assert.match(lazy, /ASSET_VERSION = '6\.3\.17'/);
assert.ok(index.includes('assets/js/core/stability.js?v=6.3.17'));
assert.ok(index.includes('assets/js/core/lazy-loader.js?v=6.3.17'));

async function testOptions(){
  const handler = require("../api/audit");
  const captured = {headers:{}};
  const response = {
    setHeader(name,value){captured.headers[name]=value;},
    status(code){captured.status=code;return this;},
    json(payload){captured.payload=payload;return payload;},
    end(){captured.ended=true;return this;}
  };
  await handler({method:"OPTIONS",headers:{},socket:{}},response);
  assert.equal(captured.status,204);
  assert.equal(captured.ended,true);
  assert.match(String(captured.headers.Allow||""),/POST/);
  assert.match(String(captured.headers.Allow||""),/OPTIONS/);
}

testOptions().then(()=>console.log("Get Code HF1 lulus: false-offline tidak memblokir room dan audit OPTIONS valid."))
.catch((error)=>{console.error(error);process.exit(1);});
