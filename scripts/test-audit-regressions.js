'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {databaseRequest}=require('../lib/database');
async function socialScenario(responseValue){
  let task;const events=[];
  const window={NexoraScheduleIdle(fn){task=fn;}};
  const context={window,location:{origin:'https://example.com'},document:{querySelectorAll(){return [];},getElementById(){return null;},dispatchEvent(e){events.push(e);}},CustomEvent:function(name,options){this.name=name;this.detail=options.detail;},URL,fetch:async()=>responseValue,setTimeout};
  vm.runInNewContext(fs.readFileSync('assets/js/core/social-links.js','utf8'),context);task();await window.NexoraSocialLinks.ready;return window.NexoraSocialLinks.all();
}
(async()=>{
  assert.equal((await socialScenario({ok:true,json:async()=>({ok:true,data:[]})})).length,0,'successful empty social list must hide fallback links');
  assert.ok((await socialScenario({ok:false,json:async()=>({ok:false})})).length>0,'network/server failure retains fallback');
  assert.equal((await socialScenario({ok:true,json:async()=>({ok:true,data:[{key:'test',url:'https://example.com',is_active:true}]})}))[0].key,'test');
  console.log('PASS: social empty, failure, custom settings');
  process.env.SUPABASE_URL='https://db.example.com';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
  const previousFetch=global.fetch;
  try{
    global.fetch=(_url,options)=>new Promise((_resolve,reject)=>{if(options.signal.aborted)return reject(Object.assign(new Error('aborted'),{name:'AbortError'}));options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});});
    const external=new AbortController();
    await assert.rejects(Promise.race([databaseRequest('tools',{timeoutMs:20,signal:external.signal}),new Promise((_resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Timeout ignored')),250);timer.unref();})]),{code:'DATABASE_TIMEOUT'});
    external.abort();await assert.rejects(databaseRequest('tools',{timeoutMs:100,signal:external.signal}),{code:'DATABASE_TIMEOUT'});
    console.log('PASS: database timeout with caller signal, pre-aborted signal');
  }finally{global.fetch=previousFetch;}
  const app=fs.readFileSync('assets/js/core/app.js','utf8');
  for(const name of ['renderInstagram','renderYoutube','renderSpotify','renderTiktok','renderTiktokQuote','nxFindHttp','nxFindTitle','bindCaptionCopy'])assert.doesNotMatch(app,new RegExp('function '+name+'\\('),'retired duplicate '+name);
  const canonical=[['assets/js/core/downloader-renderers.js',['renderInstagram','renderYoutube','renderSpotify']],['assets/js/features/tiktok.js',['renderTiktok']],['assets/js/features/tiktok-quote.js',['renderTiktokQuote']]];
  for(const [file,names] of canonical)for(const name of names)assert.match(fs.readFileSync(file,'utf8'),new RegExp('window\\.'+name+'\\s*='));
  // Verify the remaining local upload helper releases resources on both outcomes.
  const source=app.slice(app.indexOf('function nxLoadLocalImage('),app.indexOf('function renderEktp('));
  let img;const revoked=[];class Image{constructor(){img=this;}}
  const context={Image,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:url=>revoked.push(url)}};vm.runInNewContext(source,context);
  let pending=context.nxLoadLocalImage({});img.onload();await pending;assert.deepEqual(revoked,['blob:test']);
  pending=context.nxLoadLocalImage({});img.onerror(new Error('decode'));await assert.rejects(pending);assert.equal(revoked.length,2);
  console.log('PASS: canonical renderer ownership and image resource cleanup');
  const adminTools=fs.readFileSync('api/admin/tools.js','utf8');
  const memberSource=adminTools.slice(adminTools.indexOf('async function memberRows('),adminTools.indexOf('async function updateMember('));
  const members={URL,clean:value=>String(value||''),databaseRequest:async resource=>resource.startsWith('profiles?')?[{id:'missing'},{id:'invalid'},{id:'valid'}]:[{user_id:'missing',plan:'vvip',status:'active',expires_at:null},{user_id:'invalid',plan:'vvip',status:'active',expires_at:'invalid-date'},{user_id:'valid',plan:'vvip',status:'active',expires_at:'2999-01-01T00:00:00Z'}]};
  vm.runInNewContext(memberSource,members);const rows=await members.memberRows(new URL('https://example.com/?resource=members'));
  assert.deepEqual(Array.from(rows,row=>row.effective_status),['free','free','vvip']);
  const dbFile=require.resolve('../lib/database');require.cache[dbFile].exports={getDatabaseConfig:()=>({configured:true}),databaseRequest:async()=>[]};
  const publicDatabase=require('../lib/public-database');
  const makeResponse=()=>({headers:{},setHeader(key,value){this.headers[key]=value;},status(value){this.code=value;return this;},json(value){this.body=value;return this;}});
  for(const resource of ['__proto__','constructor','toString']){const res=makeResponse();await publicDatabase({method:'GET',url:'/api/database?resource='+resource,headers:{}},res);assert.equal(res.code,400);}
  for(const resource of ['settings','socials']){const res=makeResponse();await publicDatabase({method:'GET',url:'/api/database?resource='+resource,headers:{}},res);assert.equal(res.code,200);assert.equal(res.headers['Cache-Control'],'no-store');}
  console.log('PASS: membership expiry classification, resource allowlist and fresh public settings');

})().catch(error=>{console.error(error);process.exitCode=1;});
