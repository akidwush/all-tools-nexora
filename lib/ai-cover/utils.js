"use strict";
const {CoverError}=require("./errors");
const D={"2:3":{width:1024,height:1536},"3:4":{width:1024,height:1365},"4:5":{width:1024,height:1280},"9:16":{width:1024,height:1792},"1:1":{width:1024,height:1024}};
const dimensions=r=>D[r]||D["2:3"];
async function timedFetch(url,o={},ms=55000,f=global.fetch){const c=new AbortController(),t=setTimeout(()=>c.abort(),Math.max(1000,ms||55000));try{return await f(url,{...o,signal:c.signal})}finally{clearTimeout(t)}}
async function responseError(r){let d="";try{d=(await r.text()).slice(0,800)}catch{}const e=new Error(`Provider HTTP ${r.status}: ${d}`);e.status=r.status;throw e}
const imageBuffer=(b,m,w,h)=>({base64:`data:${m};base64,${Buffer.from(b).toString("base64")}`,width:w,height:h});
const blobOf=i=>new Blob([Buffer.from(i.base64,"base64")],{type:i.mimeType});
function ensure(images){if(!images?.length)throw new CoverError("Provider tidak mengembalikan gambar.","COVER_EMPTY_RESULT",502,{retryable:true});return images}
module.exports={dimensions,timedFetch,responseError,imageBuffer,blobOf,ensure};
