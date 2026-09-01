"use strict";
const {ensure}=require("./utils");
function image(i){if(!i)return null;const url=/^https:\/\//i.test(i.url||"")?i.url:undefined,base64=/^data:image\/(png|jpeg|webp);base64,/i.test(i.base64||"")?i.base64:undefined;if(!url&&!base64)return null;return {...(url?{url}:{}),...(base64?{base64}:{}),...(i.width?{width:Number(i.width)}:{}),...(i.height?{height:Number(i.height)}:{})}}
function normalizeResult(provider,model,r={}){return{provider,model:String(r.model||model),images:ensure((r.images||[]).map(image).filter(Boolean)),...(Number.isFinite(Number(r.seed))?{seed:Number(r.seed)}:{}),...(r.requestId?{requestId:String(r.requestId)}:{})}}
module.exports={normalizeResult};
