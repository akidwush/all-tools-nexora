'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {run}=require('../assets/comic-reader/translate-queue');
(async()=>{
 for(const count of [1,10,30,55]){
  let active=0,max=0;const done=[];const control={};
  const r=await run({pages:Array.from({length:count},(_,i)=>i),concurrency:2,control,request:async i=>{active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));active--;return i;},result:(i)=>done.push(i),progress:()=>{},failed:()=>assert.fail(),pause:()=>assert.fail(),delay:async()=>{}});
  assert.equal(r.completed,count);assert.equal(done.length,count);assert(max<=2);
 }
 let calls=[],complete=[],control={};
 const options={pages:[0,1,2,3,4],concurrency:2,control,request:async i=>{calls.push(i);await new Promise(r=>setImmediate(r));return i;},result:i=>{complete.push(i);control.cancel();},progress:()=>{},failed:()=>{},pause:()=>{},delay:async()=>{}};
 await run(options);assert(calls.length<=2);assert.equal(complete.length,calls.length);
 const resumed=[];await run({...options,control:{},pages:options.pages.filter(i=>!complete.includes(i)),request:async i=>i,result:i=>resumed.push(i)});assert.equal(new Set([...complete,...resumed]).size,5);
 const failed=[],tries={};await run({...options,control:{},request:async i=>{tries[i]=(tries[i]||0)+1;if(i===1)throw Object.assign(Error('upstream'),{status:502});return i;},result:()=>{},failed:i=>failed.push(i)});assert.deepEqual(failed,[1]);assert.equal(tries[1],2);assert.equal(tries[4],1);
 let attempts=0,paused=false;await run({...options,control:{},concurrency:1,request:async()=>{attempts++;throw Object.assign(Error('quota'),{status:429});},result:()=>{},pause:()=>{paused=true;}});assert.equal(attempts,1);assert(paused);
 attempts=0;await run({...options,control:{},concurrency:1,request:async()=>{attempts++;throw TypeError('offline');},result:()=>{},pause:()=>{}});assert.equal(attempts,1);
 const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 assert.match(read('assets/comic-reader/app.js'),/nexora:comic-pages/);assert.match(read('assets/comic-reader/index.html'),/translate-queue\.js/);
 assert.match(read('assets/js/shared/supabase-client.js'),/comic-translate-page/);
 assert.match(read('lib/comic-translation-settings.js'),/requireAdmin\(request,response,\{edit:true\}\)/);assert.match(read('lib/comic-translation-settings.js'),/verifyMutationRequest/);
 for(const file of ['assets/comic-reader/translate.js','assets/comic-reader/translate-queue.js','assets/js/admin/comic-translation.js'])assert.doesNotMatch(read(file),/GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|generativelanguage/);
 console.log('Translate All: 1/10/30/55 pages, bounded concurrency, cancel, resume, partial failure, retry, offline/quota stop, admin guard and secret separation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
