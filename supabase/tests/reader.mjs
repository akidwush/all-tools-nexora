import {JSDOM} from 'jsdom';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url);
const dom=new JSDOM('<!doctype html><main id="room"></main>',{url:'https://all-tools-nexora.vercel.app/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;const body=w.document.querySelector('main');let id='',offline=false,translationFails=false,writes=[],fetches=0;
const page={source:'japan',pageTitle:'源氏物語/桐壺',title:'桐壺',html:'<p><ruby>源<rt>げん</rt></ruby>文学<a href="#cite_note-1">1</a></p><p id="cite_note-1">Catatan</p>',paragraphs:[{index:0,original:'源文学',html:'<p><ruby>源<rt>げん</rt></ruby>文学</p>'}]};
w.NexoraSupabase={userId:()=>id,invoke:async(name,data)=>{fetches++;if(offline)throw Error('Offline');if(name==='wikisource-search')return {results:[{title:'源氏物語',pageTitle:page.pageTitle}]};if(name==='wikisource-page')return {...page};if(name==='wikisource-chapters')return {chapters:[{title:'桐壺',pageTitle:page.pageTitle}]};if(translationFails)throw Error('Terjemahan gagal');return {mode:data.mode,paragraphs:[{index:0,original:'源文学',translated:'Sastra sumber'}]};},rows:async(table,query,method,payload)=>{if(offline)throw Error('Offline');if(method)writes.push({table,query,method,payload});return [];}};
for(const file of ['state.js','reader.js'])w.eval(await fs.readFile(new URL('assets/js/features/world-classics/'+file,root),'utf8'));
const tick=()=>new Promise(r=>setTimeout(r,15));
function click(selector){body.querySelector(selector).click();}
function change(selector,value){const e=body.querySelector(selector);e.value=value;e.dispatchEvent(new w.Event('change'));}
const store=w.NexoraClassicsState;
const unsafe=store.safeHTML('<p onclick="x()"><ruby>字<rt>じ</rt></ruby><img src=x onerror=x()><a href="javascript:x()">x</a></p><svg onload="x()"></svg>','japan');
assert.equal(unsafe.querySelector('svg,img,[onclick],[onerror],[href^="javascript:"]'),null);assert(unsafe.querySelector('ruby rt'));
console.log('PASS browser defensive sanitizer and ruby preservation');
w.renderWorldClassics(body);await tick();const form=body.querySelector('form');form.elements.query.value='源氏物語';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(body.querySelectorAll('.wc-results button').length,1);click('.wc-results button');await tick();
assert.equal(body.querySelector('.wc-work').hidden,false);assert(body.querySelector('.wc-content ruby rt'));assert.match(body.querySelector('.wc-attribution a').href,/^https:\/\/ja\.wikisource\.org\/wiki\//);
assert.equal(body.querySelector('.wc-content a').getAttribute('href'),'#cite_note-1');const beforeHash=w.location.hash;click('.wc-content a');assert.equal(w.location.hash,beforeHash);
click('.wc-bookmark');await tick();assert.equal(store.list('bookmarks','').length,1);assert.equal(writes.length,0);
click('.wc-translate');await tick();assert.equal(body.querySelector('.wc-view').value,'bilingual');assert(body.querySelector('.wc-content ruby'));assert.match(body.querySelector('.wc-content').textContent,/Sastra sumber/);
change('.wc-mode','Literal');assert.match(body.querySelector('.wc-content').textContent,/文学/);assert.doesNotMatch(body.querySelector('.wc-content').textContent,/Sastra sumber/);
translationFails=true;click('.wc-translate');await tick();assert.match(body.querySelector('.wc-translation-status').textContent,/gagal/);assert(body.querySelector('.wc-content ruby'));
body.__nxCleanup();assert.equal(store.list('history','').length,1);assert.equal(writes.length,0);
console.log('PASS guest search/read/translate/bookmark/history, mode separation and provider failover');
offline=true;w.renderWorldClassics(body);await tick();click('.wc-shelf-items button');await tick();assert.equal(body.querySelector('.wc-work').hidden,false);assert.match(body.querySelector('.wc-content').textContent,/文学/);body.__nxCleanup();console.log('PASS offline chapter fallback');
offline=false;id='user-a';w.renderWorldClassics(body);await tick();assert.match(body.querySelector('.wc-shelf-items').textContent,/Belum ada/);form.elements.query.value='unused';
const form2=body.querySelector('form');form2.elements.query.value='源氏';form2.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();click('.wc-results button');await tick();click('.wc-bookmark');await tick();assert.equal(writes.filter(p=>p.table==='world_classics_bookmarks').length,1);assert.equal(writes[0].payload.user_id,'user-a');
body.querySelector('.wc-content').dispatchEvent(new w.Event('scroll'));assert.equal(writes.filter(p=>p.table==='world_classics_history').length,0);body.__nxCleanup();await tick();assert.equal(writes.filter(p=>p.table==='world_classics_history').length,1);
id='user-b';w.renderWorldClassics(body);await tick();assert.match(body.querySelector('.wc-shelf-items').textContent,/Belum ada/);assert.equal(store.list('bookmarks','user-a').length,1);assert.equal(store.list('bookmarks','user-b').length,0);body.__nxCleanup();
console.log('PASS authenticated cloud writes, throttled scroll writes, account A/B local separation and cleanup');
// Exercise the actual transport: existing account bridge, no guest bearer,
// no token persisted, bounded table/function names, session retry and logout.
const transport=new JSDOM('<!doctype html>',{url:'https://all-tools-nexora.vercel.app',runScripts:'outside-only'});const tw=transport.window;let requests=[],expired=false;
tw.NexoraAccount={state:{authenticated:false,user:null}};tw.fetch=async(url,options={})=>{requests.push({url,options});if(url.includes('reader-config'))return {ok:true,json:async()=>({configured:true,url:'https://test.supabase.co',publicKey:'sb_publishable_test'})};if(url==='/api/account')return {ok:true,json:async()=>({userId:'user-a',accessToken:'normal-user-token'})};if(expired){expired=false;return {ok:false,status:401,json:async()=>({})};}return {ok:true,status:200,json:async()=>({ok:true})};};
tw.eval(await fs.readFile(new URL('assets/js/shared/supabase-client.js',root),'utf8'));
await tw.NexoraSupabase.invoke('wikisource-search',{source:'japan',query:'文学'});assert.equal(requests.at(-1).options.headers.Authorization,undefined);assert.equal(requests.at(-1).options.headers.apikey,'sb_publishable_test');
await assert.rejects(tw.NexoraSupabase.rows('world_classics_cache',{}));await assert.rejects(tw.NexoraSupabase.invoke('arbitrary-url',{}));
tw.NexoraAccount.state={authenticated:true,user:{id:'user-a'}};tw.document.cookie='nx_account_csrf=csrf';tw.dispatchEvent(new tw.Event('nexora:account-ready'));expired=true;
await tw.NexoraSupabase.invoke('wikisource-page',{source:'japan',pageTitle:'Book'});assert.equal(requests.at(-1).options.headers.Authorization,'Bearer normal-user-token');assert.equal(requests.filter(r=>r.url==='/api/account').length,2);assert.equal(tw.localStorage.length,0);
tw.NexoraAccount.state={authenticated:false,user:null};tw.dispatchEvent(new tw.Event('nexora:account-ready'));await tw.NexoraSupabase.invoke('wikisource-search',{source:'japan',query:'文学'});assert.equal(requests.at(-1).options.headers.Authorization,undefined);
console.log('PASS shared Supabase transport, auth reuse, token refresh retry, logout and memory-only access token');
const css=await fs.readFile(new URL('assets/css/world-classics.css',root),'utf8');assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/min-height:44px/);assert.match(css,/height:62dvh/);assert.match(css,/overflow-wrap:anywhere/);
console.log('PASS mobile DOM/control and responsive CSS contracts (not a rendered browser test)');
w.close();tw.close();
