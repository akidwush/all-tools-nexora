const API_BASE = "https://api.freeconvert.com/v1";
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_SVG_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20000;

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

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

async function prepareUpload(body){
  const format=normalizeFormat(body?.format); const size=Number(body?.size||0);
  if(!format)throw Object.assign(new Error("Format hanya PNG atau JPG."),{status:400,code:"INVALID_FORMAT"});
  if(!Number.isFinite(size)||size<=0||size>MAX_FILE_BYTES)throw Object.assign(new Error("Ukuran file harus 1 byte sampai 12 MB."),{status:400,code:"INVALID_FILE_SIZE"});
  const task=await freeConvert("/process/import/upload",{method:"POST",body:JSON.stringify({})}); const form=findUploadForm(task); const id=taskId(task);
  if(!form||!id)throw Object.assign(new Error("FreeConvert tidak mengembalikan form upload yang valid."),{status:502,code:"INVALID_UPLOAD_FORM"});
  return {taskId:id,upload:form,format,filename:cleanName(body?.filename,`image.${format}`)};
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
  if(["failed","error","canceled","cancelled","deleted"].includes(status))return {status:"failed",message:taskError(task),errorCode:task?.result?.errorCode||null};
  const url=findExportUrl(task?.result)||findExportUrl(task);
  if(url)return {status:"success",ready:true,url};
  return {status:status||"processing",ready:false};
}

async function proxySvg(taskIdValue,response){
  const meta=await fetchResult(taskIdValue);
  if(meta.status==="failed")return send(response,422,{ok:false,error:meta.errorCode||"CONVERT_FAILED",message:meta.message});
  if(!meta.ready||!meta.url)return send(response,409,{ok:false,error:"RESULT_NOT_READY",message:"SVG belum siap."});
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),30000);
  try{
    const upstream=await fetch(meta.url,{redirect:"follow",signal:controller.signal});
    if(!upstream.ok)throw Object.assign(new Error(`SVG download HTTP ${upstream.status}`),{status:502,code:"SVG_DOWNLOAD_FAILED"});
    const buf=Buffer.from(await upstream.arrayBuffer());
    if(!buf.length)throw Object.assign(new Error("SVG hasil kosong."),{status:502,code:"EMPTY_SVG"});
    if(buf.length>MAX_SVG_BYTES)throw Object.assign(new Error("SVG hasil terlalu besar untuk preview."),{status:413,code:"SVG_TOO_LARGE"});
    const head=buf.subarray(0,512).toString("utf8");
    if(!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(head))throw Object.assign(new Error("Output FreeConvert bukan SVG valid."),{status:502,code:"INVALID_SVG"});
    response.setHeader("Cache-Control","no-store, max-age=0");
    response.setHeader("Content-Type","image/svg+xml; charset=utf-8");
    response.setHeader("Content-Length",String(buf.length));
    response.setHeader("X-Nexora-Vector-Pipeline","hf9.6-blob-stream");
    return response.status(200).send(buf);
  }catch(error){ if(error?.name==="AbortError")throw Object.assign(new Error("Download SVG timeout."),{status:504,code:"SVG_DOWNLOAD_TIMEOUT"}); throw error; }
  finally{clearTimeout(timer);}
}

async function handleFreeConvertVectorizer(request,response){
  try{
    if(request.method==="GET"&&String(request.query?.health||"")==="1")return send(response,200,{ok:true,configured:Boolean(apiKey()),service:"freeconvert-png-svg",pipeline:"hf9.6-blob-stream"});
    if(request.method==="GET"&&request.query?.download)return proxySvg(request.query.download,response);
    if(request.method!=="POST")return send(response,405,{ok:false,error:"METHOD_NOT_ALLOWED"});
    const action=String(request.body?.action||"");
    if(action==="prepare")return send(response,200,{ok:true,...(await prepareUpload(request.body))});
    if(action==="start")return send(response,200,{ok:true,...(await startConversion(request.body))});
    if(action==="result")return send(response,200,{ok:true,...(await fetchResult(request.body?.taskId))});
    return send(response,400,{ok:false,error:"INVALID_ACTION",message:"Action harus prepare, start, atau result."});
  }catch(error){ console.error("[freeconvert-vectorizer]",error?.code||error?.message||error); return send(response,Number(error?.status)||500,{ok:false,error:error?.code||"VECTOR_API_FAILED",message:error?.message||"Konversi gagal."}); }
}

module.exports={handleFreeConvertVectorizer,normalizeFormat,findExportUrl};
