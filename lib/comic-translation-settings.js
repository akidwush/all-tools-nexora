'use strict';
const {databaseRequest}=require('./database');
const {requireAdmin,verifyMutationRequest}=require('./admin-auth');
const {recordAdminAudit}=require('./admin-audit');
const {sendJson:send}=require('./http-response');
module.exports=async function updateComicTranslation(request,response){
 const session=await requireAdmin(request,response,{edit:true});
 if(!verifyMutationRequest(request))return send(response,403,{ok:false,error:'CSRF_REJECTED'});
 const value=request.body?.value;
 if(!value||typeof value.enabled!=='boolean'||typeof value.sfxDefault!=='boolean'||!Number.isInteger(value.maxConcurrentPages)||value.maxConcurrentPages<1||value.maxConcurrentPages>3||Object.keys(value).some(k=>!['enabled','sfxDefault','maxConcurrentPages'].includes(k)))return send(response,400,{ok:false,error:'INVALID_COMIC_SETTINGS',message:'Pilih 1–3 halaman bersamaan.'});
 const rows=await databaseRequest('app_settings?on_conflict=key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({key:'comic_translation',value,is_public:false,updated_at:new Date().toISOString()})});
 if(!rows?.[0])return send(response,503,{ok:false,error:'SETTINGS_UNAVAILABLE'});
 const auditLogged=await recordAdminAudit({request,session,action:'settings.comic_translation.update',entityType:'app_setting',entityId:'comic_translation',summary:'Pengaturan Translate All komik diperbarui',after:value});
 return send(response,200,{ok:true,data:rows[0],auditLogged});
};
