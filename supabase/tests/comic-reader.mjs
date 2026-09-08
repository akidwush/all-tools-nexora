import {JSDOM} from 'jsdom';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url);
const code=await fs.readFile(new URL('assets/comic-reader/translate.js',root),'utf8');
const queue=await fs.readFile(new URL('assets/comic-reader/translate-queue.js',root),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,25));
const region={id:'r1',x:.2,y:.1,width:.3,height:.2,original:'何をしているんだ？',translated:'Apa yang sedang kau lakukan?',type:'dialogue',dark:false,lowConfidence:false};
for(const width of [360,375,390,412]){
 const dom=new JSDOM('<!doctype html><div id="mangaReaderPages" class="reader-pages"><img src="/original-0.jpg"><img src="/original-1.jpg"></div>',{url:'https://all-tools-nexora.vercel.app/assets/comic-reader/index.html',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 Object.defineProperty(w,'innerWidth',{value:width,writable:true});
 const visible=[];w.IntersectionObserver=class{constructor(cb){this.cb=cb;visible.push(this);}observe(target){this.cb([{target,isIntersecting:true}]);}disconnect(){this.disconnected=true;}};
 const resize=[];w.ResizeObserver=class{constructor(cb){this.cb=cb;resize.push(this);}observe(){}disconnect(){this.disconnected=true;}};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 for(const img of w.document.querySelectorAll('img'))Object.defineProperty(img,'naturalWidth',{value:1000});
 let calls=[],fail=false,changeHash=false;const cached=new Map();
 w.NexoraSupabase={invoke:async(name,input)=>{calls.push({name,input});if(fail)throw Object.assign(Error('Layanan terjemahan sedang tidak tersedia.'),{status:503});if(name==='comic-translate-chapter')return input.action==='cancel'?{cancelled:true}:{jobId:'job',totalPages:2,identities:changeHash?['new0','new1']:['h0','h1'],cachedPages:[...cached.keys()],maxConcurrentPages:2,sfxDefault:false};
 await tick();const v={imageHash:(changeHash?'new':'h')+input.pageIndex,translation:{regions:[{...region,dark:input.pageIndex===1}, {...region,id:'sfx',type:'sound_effect',translated:'Dor!'}]}};cached.set(input.pageIndex,v);return v;}};
 w.eval(queue);w.eval(code);
 function mount(){w.document.dispatchEvent(new w.CustomEvent('nexora:comic-pages',{detail:{mangaId:'manga',chapterId:'chapter'}}));}
 function buttons(){return [...w.document.querySelectorAll('.nx-ct-toolbar button')];}
 function mode(value){const el=w.document.querySelector('select');el.value=value;el.dispatchEvent(new w.Event('change'));}
 mount();assert.equal(w.document.querySelector('select').value,'original');assert.equal(w.document.querySelectorAll('.nx-ct-region').length,0);
 buttons()[0].click();await tick();await tick();await tick();assert.equal(w.document.querySelector('select').value,'id');assert.match(w.document.querySelector('[role=status]').textContent,/2 \/ 2/);
 assert.equal(w.document.querySelectorAll('.nx-ct-region').length,2);const overlay=w.document.querySelector('.nx-ct-region');assert.equal(overlay.style.left,'20%');assert.equal(overlay.style.top,'10%');assert.equal(overlay.style.width,'30%');assert.equal(overlay.style.height,'20%');assert(w.document.querySelector('.is-dark'));
 const srcs=[...w.document.querySelectorAll('img')].map(i=>i.getAttribute('src'));assert.deepEqual(srcs,['/original-0.jpg','/original-1.jpg']);
 overlay.click();assert.match(w.document.querySelector('dialog').textContent,/Apa yang sedang/);w.document.querySelector('dialog button').click();assert.equal(w.document.querySelector('dialog'),null);
 const sfx=w.document.querySelector('input');sfx.checked=true;sfx.dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelectorAll('.nx-ct-region').length,4);
 mode('original');assert.equal(w.document.querySelectorAll('.nx-ct-region').length,0);mode('id');assert.equal(w.document.querySelectorAll('.nx-ct-region').length,4);
 // Landscape changes use image-local percentages; no page/screen coordinates cached.
 w.innerWidth=width*2;resize[0].cb();assert.equal(w.document.querySelector('.nx-ct-region').style.left,'20%');
 const first=w.document.querySelector('.nx-ct-page');visible[0].cb([{target:first,isIntersecting:false}]);assert.equal(first.querySelectorAll('.nx-ct-region').length,0);visible[0].cb([{target:first,isIntersecting:true}]);assert.equal(first.querySelectorAll('.nx-ct-region').length,2);
 const before=calls.filter(c=>c.name==='comic-translate-page').length;buttons()[0].click();await tick();await tick();assert.equal(calls.filter(c=>c.name==='comic-translate-page').length,before);
 changeHash=true;buttons()[0].click();await tick();await tick();await tick();assert.equal(calls.filter(c=>c.name==='comic-translate-page').length,before+2);
 fail=true;buttons()[0].click();await tick();await tick();assert.match(w.document.querySelector('[role=status]').textContent,/Teks asli tetap/);assert.deepEqual([...w.document.querySelectorAll('img')].map(i=>i.getAttribute('src')),srcs);
 w.dispatchEvent(new w.Event('pagehide'));assert(visible[0].disconnected);assert(resize[0].disconnected);dom.window.close();
}
console.log('PASS comic DOM: 360/375/390/412 contracts, portrait/landscape percent coordinates, modes, partial queue, cache resume/hash refresh, SFX, lazy overlay, dialog and backend failover (not rendered mobile browser QA)');
