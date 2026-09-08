import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;create table app_settings(key text primary key,value jsonb,is_public boolean,updated_at timestamptz default now());`);
for(const name of ['202609070001_world_classics_reader.sql','202609070002_comic_translate_all.sql']){const sql=await fs.readFile(new URL('../migrations/'+name,import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);}
const tables=['comic_page_translations','comic_translation_jobs','comic_translation_leases'];
for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);
 for(const table of tables){await assert.rejects(db.exec('select * from '+table));await assert.rejects(db.exec('insert into '+table+' default values'));await assert.rejects(db.exec('delete from '+table));}
 await assert.rejects(db.exec("select comic_prepare_job('guest:1','m','c','{}',1)"));
 await assert.rejects(db.exec("select comic_claim_page('k',gen_random_uuid(),gen_random_uuid(),'guest:1',2)"));
 await db.exec('reset role');
}
console.log('PASS comic migration reproducible; anon/auth cannot read or mutate cache/jobs/leases or invoke privileged RPCs');
await db.exec('set role service_role');
const owner='10000000-0000-4000-8000-000000000001';
async function job(subject,chapter='c'){return (await db.query("select * from comic_prepare_job($1,'m',$2,'{}',50)",[subject,chapter])).rows[0];}
let a=await job('a');const b=await job('b');assert(a.id&&b.id);assert.equal(await job('a','other'),undefined);
const renewed=await job('a');assert.notEqual(renewed.id,a.id);a=renewed;
async function claim(key,subject='a',id=a.id){return (await db.query('select comic_claim_page($1,$2,$3,$4,2) as ok',[key,owner,id,subject])).rows[0].ok;}
assert.equal(await claim('p0'),true);assert.equal(await claim('p0','b',b.id),false);assert.equal(await claim('p1'),true);assert.equal(await claim('p2'),false);assert.equal(await claim('p3','b',a.id),false);
await db.exec("update comic_translation_jobs set expires_at=now()-interval '1 second' where subject='a'");assert.equal(await job('a','other'),undefined); // in-flight old chapter still holds slot
await db.exec("update comic_translation_leases set expires_at=now()-interval '1 second'");assert.equal(await claim('p4'),false);a=await job('a');assert.equal(await claim('p4'),true);
console.log('PASS atomic job admission, one active chapter, two pages per identity, global duplicate lease and expiry');
for(const [hash,lang] of [['a','id'],['b','id'],['a','en']])await db.query("insert into comic_page_translations(manga_id,chapter_id,page_index,image_hash,target_language,model,translation) values('m','c',0,$1,$2,'test','{}')",[hash.repeat(64),lang]);
await assert.rejects(db.query("insert into comic_page_translations(manga_id,chapter_id,page_index,image_hash,model,translation) values('m','c',0,$1,'test','{}')",['a'.repeat(64)]));
assert.equal((await db.query('select count(*)::int as n from comic_page_translations')).rows[0].n,3);
for(let i=0;i<3;i++)assert.equal((await db.query("select wc_take_quota('comic','identity',60,1,2) as ok")).rows[0].ok,i<2);
console.log('PASS shared page uniqueness, image hash invalidation, language-separated cache and durable quota');
await db.close();
