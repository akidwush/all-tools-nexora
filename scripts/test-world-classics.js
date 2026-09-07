'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync('lib/account-membership.js','utf8');
const start=source.indexOf('function readerPublicConfig()');
const end=source.indexOf('\nasync function handleAccount',start);
function config(input){const box={getDatabaseConfig:()=>input,Buffer};vm.runInNewContext(source.slice(start,end)+'\nthis.result=readerPublicConfig();',box);return box.result;}
function jwt(role){return 'e30.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';}
for(const key of ['','sb_secret_test',jwt('service_role'),jwt('authenticated'),'invalid']){
 const result=config({validUrl:true,url:'https://test.supabase.co',publicKey:key,elevatedKey:'server-only'});
 assert.equal(result.configured,false);assert.equal(result.publicKey,'');assert.equal(result.url,'');
}
for(const key of ['sb_publishable_test',jwt('anon')])assert.equal(config({validUrl:true,url:'https://test.supabase.co',publicKey:key}).publicKey,key);
assert.equal(config({validUrl:false,url:'bad',publicKey:'sb_publishable_test'}).configured,false);
const sessionAction=source.indexOf('if (action === "reader-session")');
assert(sessionAction>source.indexOf('if (!validMutation(request))',source.indexOf('async function handleAccount')));
assert(sessionAction>source.indexOf('const session = await requireAuthenticatedUser(request, response);',source.indexOf('async function handleAccount')));
const actionBlock=source.slice(sessionAction,source.indexOf('if (action === "profile")',sessionAction));
assert(!actionBlock.includes('refresh_token'));assert(!actionBlock.includes('serviceRole'));
const c=require('../assets/config');assert.equal(c.tools.tools.filter(t=>t.id==='worldclassics').length,1);
assert.equal(c.modules['world-classics'].js[0],'assets/js/shared/supabase-client.js');
for(const asset of [...c.modules['world-classics'].js,...c.modules['world-classics'].css])assert(fs.existsSync(asset));
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
assert.equal(walk('api').filter(f=>f.endsWith('.js')).length,12);
for(const f of walk('assets/js/features/world-classics').concat('assets/js/shared/supabase-client.js')){
 const s=fs.readFileSync(f,'utf8');assert(!/SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|generativelanguage/.test(s));
}
console.log('World Classics: public key privilege rejection, existing CSRF/auth bridge, module wiring and server-only secrets passed.');
