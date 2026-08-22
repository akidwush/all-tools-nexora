const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert');
const root=path.resolve(__dirname,'..');

const ui=fs.readFileSync(path.join(root,'assets/js/features/svg-alight.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/css/features/svg-alight.css'),'utf8');
const api=fs.readFileSync(path.join(root,'lib/svgtoxml-proxy.js'),'utf8');
const route=fs.readFileSync(path.join(root,'api/tool-health.js'),'utf8');
const lazy=fs.readFileSync(path.join(root,'assets/js/core/lazy-loader.js'),'utf8');
const local=fs.readFileSync(path.join(root,'serve-local.js'),'utf8');
const { handleSvgToXml,normalizeOptions }=require(path.join(root,'lib/svgtoxml-proxy.js'));

for(const token of [
  'renderSvgAlight','/api/svg-alight',
  'data-quality="optimized"','data-quality="lossless"','data-quality="accurate"','data-quality="balanced"','data-quality="lightweight"',
  'nodeReduction','minAreaPercent','microDetailPercent','maxOutputGroups','groupByColor','removeStrokes','validateBounds',
  '/api/svg-alight?verify=1','API AUTH OK','FileReader','fidelity',
  'nsaThumb','Preview SVG','Konversi ke Alight XML'
]) assert.ok(ui.includes(token),'UI SVG Alight missing '+token);

for(const token of [
  'SVGTOXML_API_KEY','/api/v1/auth','/api/v1/convert','x-api-key','handleSvgToXml','normalizeOptions',
  'optimized','lossless','accurate','balanced','lightweight','microDetailPercent','maxOutputGroups'
]) assert.ok(api.includes(token),'API SVG Alight missing '+token);

const optimized=normalizeOptions({quality:'optimized',microDetailPercent:9,maxOutputGroups:1});
assert.equal(optimized.quality,'optimized');
assert.equal(optimized.microDetailPercent,0.25);
assert.equal(optimized.maxOutputGroups,20);
assert.equal(optimized.removeStrokes,false);
const lossless=normalizeOptions({quality:'lossless',nodeReduction:80,removeStrokes:true});
assert.equal(lossless.nodeReduction,0);
assert.equal(lossless.precision,8);
assert.equal(lossless.removeStrokes,false);
assert.equal(normalizeOptions({}).quality,'optimized');

assert.ok(route.includes('handleSvgToXml'),'route handler missing');
assert.ok(css.includes('@media(max-width:760px)'),'mobile CSS missing');
assert.ok(css.includes('min-height:44px'),'44px touch target CSS missing');
assert.ok(local.includes('mode === "svg-alight") return 4_250_000'),'local 2 MB SVG JSON body limit missing');
assert.ok(!ui.includes('SVGTOXML_API_KEY'),'secret leaked to UI');
assert.ok(lazy.includes("svgalight:'svg-alight'"),'lazy-loader svgalight mapping missing');
assert.ok(lazy.includes("'svg-alight':"),'lazy-loader svg-alight module missing');

async function testProxyContract(){
  const previousKey=process.env.SVGTOXML_API_KEY;
  const previousFetch=global.fetch;
  const requests=[];
  process.env.SVGTOXML_API_KEY='test-server-key';
  global.fetch=async(url,init)=>{
    requests.push({url,init});
    const payload=String(url).endsWith('/api/v1/auth')
      ? {ok:true}
      : {ok:true,xml:'<alight><scene/></alight>',width:1080,height:1080,profile:{quality:'optimized'},stats:{outputShapes:12},fidelity:{exact:true,losses:[]},warnings:[]};
    return {ok:true,status:200,text:async()=>JSON.stringify(payload)};
  };
  const response=()=>({headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.statusCode=code;return this;},json(payload){this.payload=payload;return payload;}});
  try{
    const authRes=response();
    await handleSvgToXml({method:'GET',url:'/api/svg-alight?verify=1'},authRes,new URL('http://localhost/api/svg-alight?verify=1'));
    assert.equal(authRes.statusCode,200);
    assert.equal(authRes.payload.authorized,true);
    assert.equal(requests[0].url,'https://svgtoxml.vercel.app/api/v1/auth');
    assert.equal(requests[0].init.headers['x-api-key'],'test-server-key');

    const convertRes=response();
    await handleSvgToXml({method:'POST',body:{svg:'<svg viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>',options:{quality:'optimized'}}},convertRes);
    assert.equal(convertRes.statusCode,200);
    assert.equal(convertRes.payload.profile.quality,'optimized');
    assert.equal(convertRes.payload.fidelity.exact,true);
    assert.equal(convertRes.payload.width,1080);
    assert.equal(requests[1].url,'https://svgtoxml.vercel.app/api/v1/convert');
    const upstreamBody=JSON.parse(requests[1].init.body);
    assert.equal(upstreamBody.options.microDetailPercent,0.0015);
    assert.equal(upstreamBody.options.maxOutputGroups,320);
  }finally{
    global.fetch=previousFetch;
    if(previousKey===undefined)delete process.env.SVGTOXML_API_KEY;
    else process.env.SVGTOXML_API_KEY=previousKey;
  }
}

testProxyContract().then(()=>{
  console.log('SVG -> Alight v1.8 lulus: 5 mode nyata, auth check, fidelity audit, opsi optimized, Android-safe read, dan key server-side tervalidasi.');
}).catch((error)=>{console.error(error);process.exitCode=1;});
