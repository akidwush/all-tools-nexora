'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {imageUrl,normalize,MAX_IMAGE_LENGTH}=require('../assets/js/shared/brand-config');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBmcAAAAASUVORK5CYII=';
const tests=[];
function test(name,fn){tests.push([name,fn]);}
function mock(id,exports){const filename=require.resolve(id);require.cache[filename]={id:filename,filename,loaded:true,exports};}
function response(){return {headers:{},status(code){this.statusCode=code;return this;},setHeader(k,v){this.headers[k]=v;},json(body){this.body=body;return this;}};}

test('image URL validation',()=>{
  for(const value of ['javascript:alert(1)','http://example.com/a.png','//evil.example/a.png','/\\evil.example/a.png','https://u:p@example.com/a.png','https://example.com/\n/a','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,PGh0bWw+','data:image/png;base64,'+'A'.repeat(MAX_IMAGE_LENGTH),42])assert.equal(imageUrl(value),null,String(value).slice(0,50));
  assert.equal(imageUrl(''), '');assert.equal(imageUrl('/assets/logo.png'),'/assets/logo.png');assert.equal(imageUrl(png),png);
  assert.equal(imageUrl('https://example.com/logo.png'),'https://example.com/logo.png');
  assert.equal(normalize({logoUrl:'/logo.png'}),null);
  assert.deepEqual(normalize({logoUrl:'',iconUrl:''}),{logoUrl:'',iconUrl:''});
});
let edit=true,csrf=true,writes=[];
mock('../lib/admin-auth',{requireAdmin:async(_q,_r,options)=>{assert.equal(options.edit,true);if(!edit)throw Object.assign(new Error('Forbidden'),{status:403});return {user:{id:'test-admin'}};},verifyMutationRequest:()=>csrf});
mock('../lib/database',{databaseRequest:async(path,options)=>{const row=JSON.parse(options.body);writes.push({path,row});return [row];}});
mock('../lib/admin-audit',{recordAdminAudit:async()=>true});
const update=require('../lib/branding-settings');
test('admin save, reset, CSRF, role and validation',async()=>{
  let res=response();await update({body:{branding:{logoUrl:png,iconUrl:'/custom.svg'}}},res);
  assert.equal(res.statusCode,200);assert.equal(writes.length,1);assert.equal(writes[0].row.key,'branding');assert.equal(writes[0].row.is_public,true);assert.equal(res.body.data.value.iconUrl,'/custom.svg');
  res=response();await update({body:{branding:{logoUrl:'',iconUrl:''}}},res);assert.equal(res.body.data.value.logoUrl,'');
  const count=writes.length;csrf=false;res=response();await update({body:{branding:{logoUrl:png,iconUrl:''}}},res);assert.equal(res.statusCode,403);assert.equal(writes.length,count);csrf=true;
  res=response();await update({body:{branding:{logoUrl:'javascript:alert(1)',iconUrl:''}}},res);assert.equal(res.statusCode,400);assert.equal(writes.length,count);
  edit=false;await assert.rejects(update({body:{}},response()),{status:403});assert.equal(writes.length,count);edit=true;
});
test('public logos, favicon, title and stale response protection',async()=>{
  const logo={src:'',setAttribute(){}};const links=new Map();const meta=new Map();let resolveFetch;
  const makeNode=()=>({setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}});
  const document={readyState:'complete',title:'',head:{appendChild(node){links.set(node.rel,node);}},querySelectorAll(selector){return selector==='[data-nx-logo]'?[logo]:[];},querySelector(selector){const match=selector.match(/^link\[rel="(.+)"\]$/);if(match)return links.get(match[1])||null;if(selector.startsWith('meta[')){if(!meta.has(selector))meta.set(selector,makeNode());return meta.get(selector);}return null;},createElement:makeNode};
  const window={NexoraConfig:{brand:{shortName:'Nexora',name:'All Tools Nexora',title:'Nexora',canonicalUrl:'https://example.com/',logoUrl:'https://example.com/favicon.svg'}},NexoraBrandConfig:{normalize}};
  const sandbox={window,document,location:{pathname:'/admin/login.html',origin:'https://example.com'},URL,AbortController,setTimeout,clearTimeout,fetch:()=>new Promise(resolve=>{resolveFetch=resolve;})};
  vm.runInNewContext(fs.readFileSync('assets/branding.js','utf8'),sandbox);
  assert.equal(document.title,'Login Admin — Nexora');assert.equal(logo.src,'/favicon.svg');
  window.NexoraBranding.apply({logoUrl:png,iconUrl:'/custom.svg'});assert.equal(logo.src,png);assert.equal(links.get('icon').href,'/custom.svg');assert.equal(links.get('apple-touch-icon').href,'/custom.svg');assert.equal(links.get('icon').type,undefined);
  resolveFetch({ok:true,json:async()=>({ok:true,data:[{key:'branding',value:{logoUrl:'/stale.png',iconUrl:''}}]})});await new Promise(resolve=>setImmediate(resolve));assert.equal(logo.src,png,'late startup response must not overwrite a saved logo');
  window.NexoraBranding.apply({logoUrl:'/new.png',iconUrl:''});assert.equal(links.get('icon').href,'/new.png');logo.onerror();assert.equal(logo.src,'/favicon.svg');assert.equal(logo.onerror,null);
  window.NexoraBranding.apply({logoUrl:'',iconUrl:''});assert.equal(logo.src,'/favicon.svg');
});
(async()=>{for(const [name,fn] of tests){await fn();console.log('PASS:',name);}console.log('Branding audit behavior tests lulus.');})().catch(error=>{console.error(error);process.exitCode=1;});
