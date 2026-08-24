const { databaseRequest } = require("../../lib/database");
const { requireAdmin, verifyMutationRequest } = require("../../lib/admin-auth");
const { recordAdminAudit } = require("../../lib/admin-audit");
const { TOOL_CATALOG } = require("../../lib/tool-health");

const ALLOWED_CATEGORIES = new Set(["downloader", "maker", "tools", "vault", "external"]);
const BUILTIN_TOOL_IDS = new Set(TOOL_CATALOG.map((item) => item.id));
const RETIRED_TOOL_IDS = new Set(["bigimage"]);
const TOOL_SELECT = "id,name,description,category,badge,icon,external_url,is_active,access_level,sort_order,metadata,created_at,updated_at";

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

function clean(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function booleanValue(value, fallback = false) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function externalUrl(value) {
  const text = clean(value, 500);
  if (!text) return null;
  const parsed = new URL(text);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("INVALID_EXTERNAL_URL");
  return parsed.toString();
}

function iconValue(value) {
  const icon = clean(value, 100).replace(/\s+/g, " ");
  if (!icon) return "fa-solid fa-arrow-up-right-from-square";
  return /^(?:fa-solid|fa-regular|fa-brands)\s+fa-[a-z0-9-]+$/i.test(icon)
    ? icon
    : null;
}

function sortValue(value) {
  const number = Number(value);
  return Math.max(-10000, Math.min(10000, Number.isFinite(number) ? Math.trunc(number) : 0));
}

function isCustomTool(item) {
  const metadata = item && item.metadata;
  return Boolean(metadata && typeof metadata === "object" && metadata.origin === "admin" && metadata.kind === "external-link");
}

function customMetadata() {
  return { origin: "admin", kind: "external-link", schemaVersion: 1 };
}

function builtinSeed(item, index) {
  return {
    id: item.id,
    name: item.name,
    description: "",
    category: ALLOWED_CATEGORIES.has(item.category) ? item.category : "tools",
    badge: null,
    icon: null,
    external_url: item.target?.type === "external-app" ? item.target.url || null : null,
    is_active: true,
    access_level: "free",
    sort_order: index * 10,
    metadata: { origin: "builtin-catalog", schemaVersion: 1 }
  };
}

async function ensureBuiltinCatalogRows(rows) {
  const existing = new Set((Array.isArray(rows) ? rows : []).map(item => item.id));
  const missing = TOOL_CATALOG.filter(item => !existing.has(item.id));
  if (!missing.length) return rows;
  await databaseRequest("tools?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(missing.map((item) => builtinSeed(item, TOOL_CATALOG.findIndex((row) => row.id === item.id))))
  });
  return databaseRequest(`tools?select=${TOOL_SELECT}&order=sort_order.asc,name.asc`, { method: "GET" });
}

function responseShape(item) {
  return item ? { ...item, is_custom: isCustomTool(item) } : null;
}

function auditShape(item) {
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    badge: item.badge,
    icon: item.icon,
    externalUrl: item.external_url,
    isActive: item.is_active,
    accessLevel: item.access_level || "free",
    sortOrder: item.sort_order,
    isCustom: isCustomTool(item)
  };
}

function toolId(value) {
  const id = clean(value, 80).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,79}$/.test(id) ? id : null;
}

function toolPayload(body, current) {
  const category = clean(body.category, 30).toLowerCase() || current?.category || "external";
  if (!ALLOWED_CATEGORIES.has(category)) return { error: "INVALID_CATEGORY" };
  let url = null;
  try { url = externalUrl(body.externalUrl); }
  catch { return { error: "INVALID_EXTERNAL_URL", message: "URL eksternal harus memakai http atau https." }; }
  if (isCustomTool(current) && !url) return { error: "CUSTOM_URL_REQUIRED", message: "Tool kustom wajib memiliki URL eksternal." };
  const icon = iconValue(body.icon);
  if (!icon) return { error: "INVALID_ICON", message: "Icon harus berupa class Font Awesome yang valid." };
  const name = clean(body.name, 80);
  if (name.length < 2) return { error: "INVALID_NAME" };
  return {
    name,
    description: clean(body.description, 240),
    category,
    badge: clean(body.badge, 30) || null,
    icon,
    external_url: url,
    is_active: booleanValue(body.isActive, current ? Boolean(current.is_active) : true),
    access_level: ["free","vvip"].includes(clean(body.accessLevel,10).toLowerCase()) ? clean(body.accessLevel,10).toLowerCase() : (current?.access_level || "free"),
    sort_order: sortValue(body.sortOrder),
    updated_at: new Date().toISOString(),
    ...(current ? { metadata: current.metadata || {} } : { metadata: customMetadata() })
  };
}

async function memberRows(url) {
  const q=clean(url.searchParams.get("q"),120).toLowerCase(),status=clean(url.searchParams.get("status"),20).toLowerCase();
  const [profiles,subscriptions]=await Promise.all([
    databaseRequest("profiles?select=id,email,display_name,avatar_url,role,account_status,created_at,updated_at&order=created_at.desc",{method:"GET"}),
    databaseRequest("subscriptions?select=user_id,plan,status,started_at,expires_at,updated_at",{method:"GET"})
  ]);
  const byUser=new Map((subscriptions||[]).map(row=>[row.user_id,row]));
  return (profiles||[]).map(profile=>{const sub=byUser.get(profile.id)||{};const expired=sub.plan==="vvip"&&sub.expires_at&&new Date(sub.expires_at).getTime()<=Date.now();const effective=profile.account_status==="suspended"||sub.status==="suspended"?"suspended":sub.plan==="vvip"&&sub.status==="active"&&!expired?"vvip":expired?"expired":"free";return {...profile,subscription:sub,effective_status:effective};}).filter(row=>(!q||`${row.email} ${row.display_name}`.toLowerCase().includes(q))&&(!status||status==="all"||row.effective_status===status));
}

async function updateMember(body,request,session){
  const userId=clean(body.userId,80),action=clean(body.action,24).toLowerCase();if(!/^[0-9a-f-]{36}$/i.test(userId))return {status:400,payload:{ok:false,error:"INVALID_USER"}};
  const profiles=await databaseRequest(`profiles?select=id,email,display_name,role,account_status&id=eq.${encodeURIComponent(userId)}&limit=1`,{method:"GET"});const profile=profiles?.[0];if(!profile)return {status:404,payload:{ok:false,error:"MEMBER_NOT_FOUND"}};if(profile.role==="admin")return {status:409,payload:{ok:false,error:"ADMIN_MEMBER_PROTECTED",message:"Membership admin tidak dapat diubah dari panel member."}};
  const now=new Date(),before=(await databaseRequest(`subscriptions?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`,{method:"GET"}))?.[0]||null;let profilePatch=null,subPatch=null;
  if(["activate","extend"].includes(action)){const days=Math.max(1,Math.min(3650,Number(body.days)||30)),current=before?.expires_at?new Date(before.expires_at):null,base=current&&current>now?current:now,custom=body.expiresAt?new Date(body.expiresAt):null;if(body.expiresAt&&(!custom||Number.isNaN(custom.getTime())||custom<=now))return {status:400,payload:{ok:false,error:"INVALID_EXPIRY_DATE",message:"Tanggal berakhir VVIP harus valid dan berada di masa depan."}};const expires=custom||new Date(base.getTime()+days*86400000);subPatch={plan:"vvip",status:"active",started_at:before?.started_at||now.toISOString(),expires_at:expires.toISOString()};profilePatch={role:"vvip",account_status:"active"};}
  else if(action==="revoke"){subPatch={plan:"free",status:"revoked",expires_at:now.toISOString()};profilePatch={role:"free",account_status:"active"};}
  else if(action==="suspend"){subPatch={status:"suspended"};profilePatch={account_status:"suspended"};}
  else if(action==="restore"){const active=before?.plan==="vvip"&&before?.expires_at&&new Date(before.expires_at)>now;subPatch={status:active?"active":"expired"};profilePatch={account_status:"active",role:active?"vvip":"free"};}
  else return {status:400,payload:{ok:false,error:"INVALID_MEMBER_ACTION"}};
  await databaseRequest(`profiles?id=eq.${encodeURIComponent(userId)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(profilePatch)});await databaseRequest("subscriptions?on_conflict=user_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:userId,...subPatch})});
  const after=(await databaseRequest(`subscriptions?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`,{method:"GET"}))?.[0]||null;await recordAdminAudit({request,session,action:`membership.${action}`,entityType:"membership",entityId:userId,summary:`Membership ${profile.email||userId}: ${action}`,before,after});return {status:200,payload:{ok:true,data:{userId,profile:{...profile,...profilePatch},subscription:after}}};
}

async function findTool(id) {
  const rows = await databaseRequest(`tools?select=${TOOL_SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`, { method: "GET" });
  return Array.isArray(rows) ? rows[0] || null : null;
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, POST, PATCH, DELETE, OPTIONS");
    return response.status(204).end();
  }

  try {
    const url=new URL(request.url||"/api/admin/tools",`http://${request.headers.host||"localhost"}`);
    if(url.searchParams.get("resource")==="members"){
      if(request.method==="GET"){await requireAdmin(request,response);return send(response,200,{ok:true,data:await memberRows(url)});}
      if(request.method!=="PATCH")return send(response,405,{ok:false,error:"METHOD_NOT_ALLOWED"});
      const session=await requireAdmin(request,response,{edit:true});if(!verifyMutationRequest(request))return send(response,403,{ok:false,error:"CSRF_REJECTED"});const result=await updateMember(request.body||{},request,session);return send(response,result.status,result.payload);
    }
    if (request.method === "GET") {
      await requireAdmin(request, response);
      let rows = await databaseRequest(`tools?select=${TOOL_SELECT}&order=sort_order.asc,name.asc`, { method: "GET" });
      rows = await ensureBuiltinCatalogRows(rows);
      return send(response, 200, { ok: true, data: (Array.isArray(rows) ? rows : []).filter((item) => !RETIRED_TOOL_IDS.has(item.id)).map(responseShape) });
    }

    if (!["POST", "PATCH", "DELETE"].includes(request.method)) {
      response.setHeader("Allow", "GET, POST, PATCH, DELETE, OPTIONS");
      return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const session = await requireAdmin(request, response, { edit: true });
    if (!verifyMutationRequest(request)) return send(response, 403, { ok: false, error: "CSRF_REJECTED" });
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const id = toolId(body.id);
    if (!id) return send(response, 400, { ok: false, error: "INVALID_TOOL_ID" });

    if (request.method === "POST") {
      if (BUILTIN_TOOL_IDS.has(id)) return send(response, 409, { ok: false, error: "BUILTIN_ID_RESERVED", message: "ID ini dipakai oleh tool bawaan." });
      const existing = await findTool(id);
      if (existing) return send(response, 409, { ok: false, error: "TOOL_ID_EXISTS", message: "ID tool sudah digunakan." });
      const payload = toolPayload(body);
      if (payload.error) return send(response, 400, payload);
      if (!payload.external_url) return send(response, 400, { ok: false, error: "CUSTOM_URL_REQUIRED", message: "Tool baru wajib memiliki URL eksternal." });

      const rows = await databaseRequest("tools", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ id, ...payload })
      });
      const item = Array.isArray(rows) ? rows[0] : null;
      if (!item) return send(response, 500, { ok: false, error: "TOOL_CREATE_FAILED" });
      const auditLogged = await recordAdminAudit({
        request,
        session,
        action: "tool.create",
        entityType: "tool",
        entityId: id,
        summary: `Tool ${item.name} ditambahkan`,
        before: null,
        after: auditShape(item)
      });
      return send(response, 201, { ok: true, data: responseShape(item), auditLogged, createdBy: session.user.email || session.user.id });
    }

    const current = await findTool(id);
    if (!current) return send(response, 404, { ok: false, error: "TOOL_NOT_FOUND" });

    if (request.method === "DELETE") {
      if (!isCustomTool(current)) return send(response, 409, { ok: false, error: "BUILTIN_TOOL_PROTECTED", message: "Tool bawaan tidak dihapus. Gunakan Edit lalu nonaktifkan." });
      await databaseRequest(`tools?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      });
      const auditLogged = await recordAdminAudit({
        request,
        session,
        action: "tool.delete",
        entityType: "tool",
        entityId: id,
        summary: `Tool ${current.name} dihapus`,
        before: auditShape(current),
        after: null
      });
      return send(response, 200, { ok: true, deleted: id, auditLogged, deletedBy: session.user.email || session.user.id });
    }

    const payload = toolPayload(body, current);
    if (payload.error) return send(response, 400, payload);
    const rows = await databaseRequest(`tools?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });
    const item = Array.isArray(rows) ? rows[0] : null;
    if (!item) return send(response, 404, { ok: false, error: "TOOL_NOT_FOUND" });
    const auditLogged = await recordAdminAudit({
      request,
      session,
      action: "tool.update",
      entityType: "tool",
      entityId: id,
      summary: `Tool ${item.name} diperbarui`,
      before: auditShape(current),
      after: auditShape(item)
    });
    return send(response, 200, { ok: true, data: responseShape(item), auditLogged, updatedBy: session.user.email || session.user.id });
  } catch (error) {
    if (error && error.postgresCode === "23505") {
      return send(response, 409, { ok: false, error: "TOOL_ID_EXISTS", message: "ID tool sudah digunakan." });
    }
    const status = Number(error.status || 500);
    console.error("[admin-tools]", error.code || "UNKNOWN_ERROR");
    return send(response, status, {
      ok: false,
      error: error.code || "ADMIN_TOOLS_FAILED",
      message: status === 401 ? "Sesi admin berakhir." : status === 403 ? "Akses ditolak." : "Data tools belum dapat diproses."
    });
  }
};
