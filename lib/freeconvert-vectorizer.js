const https = require("node:https");
const net = require("node:net");
const { assertPublicUrl, createPinnedLookup, isBlockedIp } = require("./audit");
const { sendJson: send } = require("./http-response");

const API_BASE = "https://api.freeconvert.com/v1";
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_SVG_BYTES = 4_000_000;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_DOWNLOAD_REDIRECTS = 4;

function cleanName(value, fallback = "image") {
  const name = String(value || fallback).replace(/[\\/\0]/g, "-").replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").slice(0, 100);
  return name || fallback;
}
function normalizeFormat(value) { const fmt=String(value||"").toLowerCase().replace("jpeg","jpg"); return fmt==="png"||fmt==="jpg"?fmt:null; }
function apiKey(){ return String(process.env.FREECONVERT_API_KEY||"").trim(); }
function validTaskId(value){ const id=String(value||"").trim(); return /^[a-zA-Z0-9_-]{8,128}$/.test(id)?id:null; }

async function freeConvert(path, options={}) {
  const key=apiKey();
  if(!key){ const e=new Error("FREECONVERT_API_KEY belum dikonfigurasi di Vercel."); e.code="FREECONVERT_NOT_CONFIGURED"; e.status=503; throw e; }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(), Number(process.env.FREECONVERT_TIMEOUT_MS)||REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(`${API_BASE}${path}`,{...options,headers:{Accept:"application/json",Authorization:`Bearer ${key}`,...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})},signal:controller.signal});
    const text=await response.text(); let data={}; try{data=text?JSON.parse(text):{};}catch{data={message:text};}
    if(!response.ok){ const e=new Error(data?.message||data?.msg||`FreeConvert HTTP ${response.status}`); e.code=data?.error||data?.code||`FREECONVERT_${response.status}`; e.status=response.status===402||response.status===429?429:response.status===401||response.status===403?response.status:502; e.upstreamStatus=response.status; throw e; }
    return data;
  }catch(error){ if(error?.name==="AbortError"){ const e=new Error("FreeConvert tidak merespons tepat waktu."); e.code="FREECONVERT_TIMEOUT"; e.status=504; throw e; } throw error; }
  finally{ clearTimeout(timer); }
}

function taskId(task){ return String(task?.id||task?._id||task?.task_id||""); }
function taskStatus(task){ return String(task?.status||"").toLowerCase(); }
function taskError(task){ return task?.result?.msg||task?.result?.message||task?.message||"Proses FreeConvert gagal."; }
function taskErrorCode(task){
  return String(task?.result?.errorCode||task?.result?.error_code||task?.result?.code||task?.result?.error||task?.errorCode||task?.error_code||"TASK_FAILED")
    .trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"_").slice(0,80)||"task_failed";
}
function classifyTaskErrorCode(value){
  const code=String(value||"").toLowerCase();
  if(/(?:daily_operations|out_of_conversion|quota|limit_exceed|payment|required|subscription)/.test(code))return "quota";
  if(/(?:invalid_credentials|insufficient_permission|unauthorized|forbidden)/.test(code))return "auth";
  if(/timeout/.test(code))return "timeout";
  if(/(?:processing_failed|engine|internal|task_failed|dependent)/.test(code))return "provider";
  return "conversion";
}
function findUploadForm(task){ const form=task?.result?.form; if(!form?.url||!form?.parameters)return null; return {url:String(form.url),parameters:form.parameters}; }
function findExportUrl(value,depth=0){
  if(depth>6||value==null)return null;
  if(typeof value==="string"&&/^https:\/\//i.test(value))return value;
  if(Array.isArray(value)){ for(const item of value){ const found=findExportUrl(item,depth+1); if(found)return found; } return null; }
  if(typeof value==="object"){
    for(const key of ["url","download_url","downloadUrl"]){ if(typeof value[key]==="string"&&/^https:\/\//i.test(value[key]))return value[key]; }
    for(const key of Object.keys(value)){ const found=findExportUrl(value[key],depth+1); if(found)return found; }
  }
  return null;
}

function requestPinnedBuffer(parsed, signal){
  const address=parsed.auditAddresses?.[0];
  if(!address||isBlockedIp(address.address)){
    return Promise.reject(Object.assign(new Error("Alamat download SVG tidak lolos validasi publik."),{status:502,code:"SVG_DOWNLOAD_ADDRESS_BLOCKED"}));
  }
  return new Promise((resolve,reject)=>{
    let settled=false;
    let total=0;
    const chunks=[];
    const finishError=(error)=>{if(settled)return;settled=true;reject(error);};
    const request=https.request(parsed,{
      method:"GET",
      signal,
      servername:net.isIP(parsed.hostname)?undefined:parsed.hostname,
      autoSelectFamily:false,
      lookup:createPinnedLookup([address]),
      headers:{Accept:"image/svg+xml,application/xml;q=0.9,*/*;q=0.1","Accept-Encoding":"identity","User-Agent":"All-Tools-Nexora-Vector/6.3.18"}
    },(response)=>{
      const declared=Number(response.headers["content-length"]||0);
      if(Number.isFinite(declared)&&declared>MAX_SVG_BYTES){
        response.destroy();
        return finishError(Object.assign(new Error("SVG hasil terlalu besar untuk Vercel Function."),{status:413,code:"SVG_TOO_LARGE"}));
      }
      if([301,302,303,307,308].includes(response.statusCode||0)){
        const location=String(response.headers.location||"");
        response.resume();
        settled=true;
        return resolve({status:response.statusCode||0,location,buffer:null});
      }
      response.on("data",(chunk)=>{
        if(settled)return;
        const buffer=Buffer.from(chunk);
        total+=buffer.length;
        if(total>MAX_SVG_BYTES){
          response.destroy();
          finishError(Object.assign(new Error("SVG hasil terlalu besar untuk Vercel Function."),{status:413,code:"SVG_TOO_LARGE"}));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end",()=>{
        if(settled)return;
        settled=true;
        resolve({status:response.statusCode||0,location:"",buffer:Buffer.concat(chunks)});
      });
      response.on("error",finishError);
    });
    request.on("error",finishError);
    request.end();
  });
}

async function downloadPublicSvg(rawUrl,signal){
  let current=String(rawUrl||"");
  for(let redirects=0;redirects<=MAX_DOWNLOAD_REDIRECTS;redirects++){
    const parsed=await assertPublicUrl(current);
    if(parsed.protocol!=="https:")throw Object.assign(new Error("Download SVG wajib memakai HTTPS."),{status:502,code:"SVG_DOWNLOAD_PROTOCOL_BLOCKED"});
    const result=await requestPinnedBuffer(parsed,signal);
    if([301,302,303,307,308].includes(result.status)){
      if(!result.location)throw Object.assign(new Error("Redirect SVG tidak memiliki tujuan."),{status:502,code:"SVG_DOWNLOAD_REDIRECT_INVALID"});
      current=new URL(result.location,parsed).toString();
      continue;
    }
    if(result.status<200||result.status>=300)throw Object.assign(new Error(`SVG download HTTP ${result.status}`),{status:502,code:"SVG_DOWNLOAD_FAILED"});
    return result.buffer;
  }
  throw Object.assign(new Error("Redirect download SVG terlalu banyak."),{status:502,code:"SVG_DOWNLOAD_REDIRECT_LIMIT"});
}

async function prepareUpload(body){
  const format=normalizeFormat(body?.format); const size=Number(body?.size||0);
  if(!format)throw Object.assign(new Error("Format hanya PNG atau JPG."),{status:400,code:"INVALID_FORMAT"});
  if(!Number.isFinite(size)||size<=0||size>MAX_FILE_BYTES)throw Object.assign(new Error("Ukuran file harus 1 byte sampai 12 MB."),{status:400,code:"INVALID_FILE_SIZE"});
  const task=await freeConvert("/process/import/upload",{method:"POST",body:JSON.stringify({})}); const form=findUploadForm(task); const id=taskId(task);
  if(!form||!id)throw Object.assign(new Error("FreeConvert tidak mengembalikan form upload yang valid."),{status:502,code:"INVALID_UPLOAD_FORM"});
  return {taskId:id,upload:form,format,filename:cleanName(body?.filename,`image.${format}`)};
}

const PROXY_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

function headerValue(request,name){
  const value=request?.headers?.[name]??request?.headers?.[name.toLowerCase()];
  return Array.isArray(value)?String(value[0]||""):String(value||"");
}

function validateFreeConvertUploadUrl(value){
  let url;
  try{url=new URL(String(value||""));}catch{return null;}
  if(url.protocol!=="https:")return null;
  const host=url.hostname.toLowerCase();
  if(host!=="freeconvert.com"&&!host.endsWith(".freeconvert.com"))return null;
  if(!/^\/api\/upload\/[a-zA-Z0-9_-]{8,128}\/?$/.test(url.pathname))return null;
  return url.toString();
}

function decodeUploadParams(value){
  try{
    const parsed=JSON.parse(decodeURIComponent(String(value||"")));
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return null;
    const clean={};
    for(const [key,val] of Object.entries(parsed)){
      if(!/^[a-zA-Z0-9_.-]{1,64}$/.test(key))continue;
      if(typeof val!=="string"&&typeof val!=="number"&&typeof val!=="boolean")continue;
      clean[key]=String(val);
    }
    return Object.keys(clean).length?clean:null;
  }catch{return null;}
}

async function readRawUploadBody(request){
  if(Buffer.isBuffer(request?.body))return request.body;
  if(request?.body instanceof Uint8Array)return Buffer.from(request.body);
  if(request?.body instanceof ArrayBuffer)return Buffer.from(request.body);
  if(typeof request?.body==="string")return Buffer.from(request.body,"binary");
  if(request?.body&&typeof request.body==="object")throw Object.assign(new Error("Body upload tidak tersedia sebagai binary stream."),{status:400,code:"INVALID_UPLOAD_BODY"});
  const chunks=[]; let total=0;
  for await(const chunk of request){
    const buf=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    total+=buf.length;
    if(total>PROXY_UPLOAD_MAX_BYTES)throw Object.assign(new Error("Upload proxy maksimal 4 MB."),{status:413,code:"PROXY_UPLOAD_TOO_LARGE"});
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function proxyRasterUpload(request,response){
  const uploadUrl=validateFreeConvertUploadUrl(headerValue(request,"x-nexora-upload-url"));
  const parameters=decodeUploadParams(headerValue(request,"x-nexora-upload-params"));
  const filename=cleanName(decodeURIComponent(headerValue(request,"x-nexora-filename")||"image"),"image");
  const mime=headerValue(request,"content-type").split(";")[0].trim().toLowerCase();
  const contentLength=Number(headerValue(request,"content-length")||0);
  if(!uploadUrl)throw Object.assign(new Error("Signed upload URL FreeConvert tidak valid."),{status:400,code:"INVALID_PROXY_UPLOAD_URL"});
  if(!parameters)throw Object.assign(new Error("Parameter signed upload tidak valid."),{status:400,code:"INVALID_PROXY_UPLOAD_PARAMS"});
  if(contentLength>PROXY_UPLOAD_MAX_BYTES)throw Object.assign(new Error("Upload proxy maksimal 4 MB."),{status:413,code:"PROXY_UPLOAD_TOO_LARGE"});
  if(!["image/png","image/jpeg","application/octet-stream"].includes(mime))throw Object.assign(new Error("Tipe file upload tidak didukung."),{status:415,code:"INVALID_PROXY_UPLOAD_TYPE"});
  const raw=await readRawUploadBody(request);
  if(!raw.length)throw Object.assign(new Error("File upload kosong."),{status:400,code:"EMPTY_PROXY_UPLOAD"});
  if(raw.length>PROXY_UPLOAD_MAX_BYTES)throw Object.assign(new Error("Upload proxy maksimal 4 MB."),{status:413,code:"PROXY_UPLOAD_TOO_LARGE"});
  const form=new FormData();
  for(const [key,val] of Object.entries(parameters))form.append(key,val);
  form.append("file",new Blob([raw],{type:mime}),filename);
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),30000);
  try{
    const upstream=await fetch(uploadUrl,{method:"POST",body:form,signal:controller.signal});
    const text=await upstream.text();
    if(!upstream.ok){
      const detail=String(text||"").replace(/\s+/g," ").slice(0,180);
      throw Object.assign(new Error(`FreeConvert upload HTTP ${upstream.status}${detail?`: ${detail}`:""}`),{status:502,code:"FREECONVERT_UPLOAD_FAILED"});
    }
    return send(response,200,{ok:true,proxied:true,upstreamStatus:upstream.status});
  }catch(error){
    if(error?.name==="AbortError")throw Object.assign(new Error("Upload FreeConvert timeout."),{status:504,code:"FREECONVERT_UPLOAD_TIMEOUT"});
    throw error;
  }finally{clearTimeout(timer);}
}

// Compatibility helpers retained for the project regression contract. HF9.6 intentionally
// does not auto-apply discovered options because FreeConvert option ranges are converter-specific.
async function getConvertOptionCatalog(format){
  const query=`/query/options/convert?input_format=${encodeURIComponent(format)}&output_format=svg`;
  try{const data=await freeConvert(query,{method:"GET"});return Array.isArray(data?.options)?data.options:[];}catch{return [];}
}
function buildAdvancedOptions(){ return {}; }

async function startConversion(body){
  const importTaskId=validTaskId(body?.importTaskId); const format=normalizeFormat(body?.format);
  if(!importTaskId||!format)throw Object.assign(new Error("Task upload atau format tidak valid."),{status:400,code:"INVALID_TASK"});
  const baseName=cleanName(body?.filename,"image").replace(/\.[^.]+$/,"")||"image";
  // HF9.6: no auto-mapped advanced options. FreeConvert defaults are range-safe.
  const convert=await freeConvert("/process/convert",{method:"POST",body:JSON.stringify({input:importTaskId,input_format:format,output_format:"svg"})});
  const convertId=taskId(convert); if(!convertId)throw Object.assign(new Error("Task konversi tidak dibuat."),{status:502,code:"CONVERT_TASK_MISSING"});
  const exported=await freeConvert("/process/export/url",{method:"POST",body:JSON.stringify({input:[convertId],filename:`${baseName}-nexora.svg`,archive_multiple_files:false})});
  const exportId=taskId(exported); if(!exportId)throw Object.assign(new Error("Task export tidak dibuat."),{status:502,code:"EXPORT_TASK_MISSING"});
  return {convertTaskId:convertId,exportTaskId:exportId};
}

async function fetchResult(taskIdValue){
  const id=validTaskId(taskIdValue); if(!id)throw Object.assign(new Error("Task ID tidak valid."),{status:400,code:"INVALID_TASK"});
  const task=await freeConvert(`/process/tasks/${encodeURIComponent(id)}`,{method:"GET"}); const status=taskStatus(task);
  if(["failed","error","canceled","cancelled","deleted"].includes(status)){
    const errorCode=taskErrorCode(task);
    return {status:"failed",message:String(taskError(task)).slice(0,240),errorCode,errorCategory:classifyTaskErrorCode(errorCode)};
  }
  const url=findExportUrl(task?.result)||findExportUrl(task);
  if(url||["completed","complete","finished","success","succeeded"].includes(status))return {status:"success",ready:true,url:url||null};
  return {status:status||"processing",ready:false};
}

async function proxySvg(taskIdValue,response){
  const meta=await fetchResult(taskIdValue);
  if(meta.status==="failed")return send(response,422,{ok:false,error:meta.errorCode||"CONVERT_FAILED",message:meta.message});
  if(!meta.ready||!meta.url)return send(response,409,{ok:false,error:"RESULT_NOT_READY",message:"SVG belum siap."});
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),30000);
  try{
    const buf=await downloadPublicSvg(meta.url,controller.signal);
    if(!buf.length)throw Object.assign(new Error("SVG hasil kosong."),{status:502,code:"EMPTY_SVG"});
    const head=buf.subarray(0,512).toString("utf8");
    if(!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(head))throw Object.assign(new Error("Output FreeConvert bukan SVG valid."),{status:502,code:"INVALID_SVG"});
    response.setHeader("Cache-Control","no-store, max-age=0");
    response.setHeader("Content-Type","image/svg+xml; charset=utf-8");
    response.setHeader("Content-Length",String(buf.length));
    response.setHeader("X-Nexora-Vector-Pipeline","6.3.18-pinned-download");
    return response.status(200).send(buf);
  }catch(error){ if(error?.name==="AbortError")throw Object.assign(new Error("Download SVG timeout."),{status:504,code:"SVG_DOWNLOAD_TIMEOUT"}); throw error; }
  finally{clearTimeout(timer);}
}

async function handleFreeConvertVectorizer(request,response){
  try{
    if(request.method==="GET"&&String(request.query?.health||"")==="1")return send(response,200,{ok:true,configured:Boolean(apiKey()),service:"freeconvert-png-svg",pipeline:"hf9.8-upload-proxy"});
    if(request.method==="GET"&&request.query?.download)return proxySvg(request.query.download,response);
    if(request.method!=="POST")return send(response,405,{ok:false,error:"METHOD_NOT_ALLOWED"});
    if(String(request.query?.proxyUpload||"")==="1")return proxyRasterUpload(request,response);
    const action=String(request.body?.action||"");
    if(action==="prepare")return send(response,200,{ok:true,...(await prepareUpload(request.body))});
    if(action==="start")return send(response,200,{ok:true,...(await startConversion(request.body))});
    if(action==="result")return send(response,200,{ok:true,...(await fetchResult(request.body?.taskId))});
    return send(response,400,{ok:false,error:"INVALID_ACTION",message:"Action harus prepare, start, atau result."});
  }catch(error){ console.error("[freeconvert-vectorizer]",error?.code||error?.message||error); return send(response,Number(error?.status)||500,{ok:false,error:error?.code||"VECTOR_API_FAILED",message:error?.message||"Konversi gagal."}); }
}

module.exports={MAX_SVG_BYTES,classifyTaskErrorCode,downloadPublicSvg,handleFreeConvertVectorizer,normalizeFormat,findExportUrl};
