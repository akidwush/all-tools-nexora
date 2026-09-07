// Optional real-project smoke test. Uses only the public key and normal user JWTs.
import assert from 'node:assert/strict';
const base=process.env.SUPABASE_URL, key=process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;
if(!base||!key)throw Error('Set SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY.');
const source=process.env.WC_TEST_SOURCE||'japan',query=process.env.WC_TEST_QUERY||'源氏物語';
async function call(path,method='GET',body,token){const r=await fetch(base.replace(/\/$/,'')+path,{method,headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>null);return {r,data};}
async function edge(name,body){const out=await call('/functions/v1/'+name,'POST',body);assert.equal(out.r.status,200,out.data?.message);return out.data;}
const found=await edge('wikisource-search',{source,query});assert(Array.isArray(found.results));
const title=process.env.WC_TEST_PAGE||found.results[0]?.pageTitle;if(!title)throw Error('No source page found');
const page=await edge('wikisource-page',{source,pageTitle:title});assert(page.paragraphs.length);const cached=await edge('wikisource-page',{source,pageTitle:title});assert.equal(cached.cached,true);
await edge('wikisource-chapters',{source,pageTitle:title});
for(const table of ['world_classics_cache','world_classics_translations','world_classics_bookmarks','world_classics_history']){const {r}=await call('/rest/v1/'+table+'?select=*&limit=1');assert([401,403].includes(r.status),'Unexpected anonymous access to '+table);}
assert.equal((await call('/functions/v1/wikisource-search','POST',{source,query,url:'https://example.com'})).r.status,400);
console.log('PASS real guest search, page, chapters, page HIT, anonymous table protection and URL rejection');
if(process.env.WC_LIVE_TRANSLATE==='1'){
 const body={source,pageTitle:title,mode:'Natural',paragraphs:page.paragraphs.map(p=>p.original)};
 const translated=await edge('translate-classic',body);assert.equal(translated.paragraphs.length,page.paragraphs.length);
 assert.equal((await edge('translate-classic',body)).cached,true);console.log('PASS real translation and cache HIT');
}else console.log('SKIP real translation: set WC_LIVE_TRANSLATE=1 and a short WC_TEST_PAGE to use provider quota');
if(process.env.WC_USER_A_TOKEN&&process.env.WC_USER_B_TOKEN){
 const tokenA=process.env.WC_USER_A_TOKEN,tokenB=process.env.WC_USER_B_TOKEN;
 const userA=(await call('/auth/v1/user','GET',undefined,tokenA)).data;assert(userA.id);
 const probe='Nexora verification '+crypto.randomUUID();
 for(const table of ['world_classics_bookmarks','world_classics_history']){
  const body={user_id:userA.id,source,work_title:probe,page_title:probe,chapter_title:'verification',reading_progress:10};
  const create=await call('/rest/v1/'+table,'POST',body,tokenA);assert([200,201].includes(create.r.status));
  const q=new URLSearchParams({user_id:'eq.'+userA.id,page_title:'eq.'+probe});
  try{
   assert.equal((await call('/rest/v1/'+table+'?'+q,'GET',undefined,tokenB)).data.length,0);
   await call('/rest/v1/'+table+'?'+q,'PATCH',{reading_progress:90},tokenB);
   assert.equal((await call('/rest/v1/'+table+'?'+q,'GET',undefined,tokenA)).data[0].reading_progress,10);
  }finally{await call('/rest/v1/'+table+'?'+q,'DELETE',undefined,tokenA);}
 }
 console.log('PASS real logged-in bookmark/history and A/B isolation');
}else console.log('SKIP real A/B auth: supply WC_USER_A_TOKEN and WC_USER_B_TOKEN for dedicated test users');
