const crypto = require("node:crypto");
const { databaseRequest } = require("./database");
const { authRequest, getAuthUser, parseCookies, refreshSession, signInWithPassword, signOutRemote } = require("./admin-auth");

const ACCESS_COOKIE="nx_account_access", REFRESH_COOKIE="nx_account_refresh", CSRF_COOKIE="nx_account_csrf";
const REFRESH_AGE=30*24*60*60;
const clean=(v,n=200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,n);
const secure=req=>String(req.headers["x-forwarded-proto"]||"").split(",")[0].trim()==="https"||(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(String(req.headers.host||"")));
function cookie(name,value,o={}){const p=[`${name}=${encodeURIComponent(value)}`,`Path=${o.path||"/"}`,`Max-Age=${Math.max(0,Math.floor(o.maxAge||0))}`];if(o.httpOnly)p.push("HttpOnly");if(o.secure)p.push("Secure");p.push(`SameSite=${o.sameSite||"Lax"}`);return p.join("; ");}
function append(res,items){const old=res.getHeader("Set-Cookie");res.setHeader("Set-Cookie",[...(Array.isArray(old)?old:old?[String(old)]:[]),...items]);}
function setCookies(req,res,session,csrf){const s=secure(req),token=csrf||crypto.randomBytes(24).toString("base64url");append(res,[cookie(ACCESS_COOKIE,session.access_token,{path:"/api",maxAge:Math.max(60,Number(session.expires_in||3600)),httpOnly:true,secure:s}),cookie(REFRESH_COOKIE,session.refresh_token,{path:"/api/account",maxAge:REFRESH_AGE,httpOnly:true,secure:s,sameSite:"Strict"}),cookie(CSRF_COOKIE,token,{maxAge:REFRESH_AGE,secure:s,sameSite:"Strict"})]);return token;}
function clearCookies(req,res){const s=secure(req);append(res,[cookie(ACCESS_COOKIE,"",{path:"/api",maxAge:0,httpOnly:true,secure:s}),cookie(REFRESH_COOKIE,"",{path:"/api/account",maxAge:0,httpOnly:true,secure:s,sameSite:"Strict"}),cookie(CSRF_COOKIE,"",{maxAge:0,secure:s,sameSite:"Strict"})]);}
function origin(req){const forwarded=String(req.headers["x-forwarded-proto"]||"").split(",")[0].trim();const proto=forwarded==="https"?"https":forwarded==="http"?"http":req.socket?.encrypted?"https":"http";const host=String(req.headers["x-forwarded-host"]||req.headers.host||"").split(",")[0].trim();if(!host||/[\s/\\]/.test(host))return"";try{return new URL(`${proto}://${host}`).origin;}catch{return"";}}
function validMutation(req){const c=parseCookies(req),a=String(c[CSRF_COOKIE]||""),b=String(req.headers["x-csrf-token"]||"");if(!a||a.length!==b.length||!crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b)))return false;const supplied=String(req.headers.origin||"");return !supplied||!origin(req)||supplied===origin(req);}

async function ensureRows(user){await databaseRequest("profiles?on_conflict=id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify([{id:user.id,email:user.email||null,display_name:clean(user.user_metadata?.display_name||String(user.email||"").split("@")[0],80)}])});await databaseRequest("subscriptions?on_conflict=user_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify([{user_id:user.id}])});}
async function membership(user){
  await ensureRows(user);
  const [profiles,subscriptions,admins]=await Promise.all([
    databaseRequest(`profiles?select=id,email,display_name,avatar_url,role,account_status,created_at&id=eq.${encodeURIComponent(user.id)}&limit=1`,{method:"GET"}),
    databaseRequest(`subscriptions?select=plan,status,started_at,expires_at,updated_at&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,{method:"GET"}),
    databaseRequest(`admin_users?select=role,is_active&user_id=eq.${encodeURIComponent(user.id)}&is_active=eq.true&limit=1`,{method:"GET"}).catch(()=>[])
  ]);
  const profile=profiles?.[0]||{},sub=subscriptions?.[0]||{},isAdmin=Boolean(admins?.[0]);
  const suspended=profile.account_status==="suspended"||sub.status==="suspended";
  const activeVvip=!suspended&&sub.plan==="vvip"&&sub.status==="active"&&sub.expires_at&&new Date(sub.expires_at).getTime()>Date.now();
  return {profile:{id:user.id,email:user.email||profile.email||null,displayName:profile.display_name||String(user.email||"").split("@")[0],avatarUrl:profile.avatar_url||null,accountStatus:profile.account_status||"active"},membership:{role:isAdmin?"admin":activeVvip?"vvip":"free",plan:isAdmin?"admin":activeVvip?"vvip":"free",status:suspended?"suspended":isAdmin||activeVvip?"active":sub.expires_at?"expired":"free",startedAt:sub.started_at||null,expiresAt:sub.expires_at||null,isVvip:isAdmin||activeVvip,isAdmin}};
}
async function resolve(req,res){const c=parseCookies(req);let access=c[ACCESS_COOKIE]||"",refresh=c[REFRESH_COOKIE]||"",user=null;if(access){try{user=await getAuthUser(access);}catch(e){if(![401,403].includes(Number(e.status)))throw e;}}if(!user&&refresh){try{const session=await refreshSession(refresh);access=session.access_token;setCookies(req,res,session,c[CSRF_COOKIE]);user=session.user||await getAuthUser(access);}catch{clearCookies(req,res);return null;}}if(!user?.id)return null;return {user,access,...await membership(user)};}
const publicSession=s=>s?{ok:true,authenticated:true,user:s.profile,membership:s.membership}:{ok:true,authenticated:false,user:null,membership:{role:"guest",plan:"free",status:"guest",isVvip:false,isAdmin:false}};
function send(res,status,payload){res.setHeader("Cache-Control","no-store, max-age=0");res.setHeader("Content-Type","application/json; charset=utf-8");return res.status(status).json(payload);}
function safeAccountMessage(status,action){
  if(status===429)return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
  if(action==="login"&&[400,401,403,422].includes(status))return "Email atau password salah.";
  if(action==="register"&&[400,409,422].includes(status))return "Akun sudah terdaftar atau data pendaftaran belum valid.";
  if(action==="adopt-session"&&[400,401,403].includes(status))return "Tautan pemulihan tidak valid atau sudah kedaluwarsa.";
  if(status>=500)return "Layanan akun belum dapat diproses.";
  return "Permintaan akun tidak dapat diproses. Periksa data lalu coba lagi.";
}

async function handleAccount(req,res){
  if(req.method==="OPTIONS"){res.setHeader("Allow","GET, POST, PATCH, DELETE, OPTIONS");return res.status(204).end();}
  try{
    if(req.method==="GET")return send(res,200,publicSession(await resolve(req,res)));
    const body=req.body&&typeof req.body==="object"?req.body:{};const action=clean(body.action,40).toLowerCase();
    if(req.method==="DELETE"){if(!validMutation(req))return send(res,403,{ok:false,error:"CSRF_REJECTED"});const c=parseCookies(req);await signOutRemote(c[ACCESS_COOKIE]);clearCookies(req,res);return send(res,200,{ok:true,authenticated:false});}
    if(!["POST","PATCH"].includes(req.method))return send(res,405,{ok:false,error:"METHOD_NOT_ALLOWED"});
    if(["login","register","forgot","adopt-session"].includes(action)){
      if(action==="login"){const session=await signInWithPassword(clean(body.email,254).toLowerCase(),String(body.password||"").slice(0,200));setCookies(req,res,session);return send(res,200,publicSession({user:session.user,access:session.access_token,...await membership(session.user)}));}
      if(action==="register"){const email=clean(body.email,254).toLowerCase(),password=String(body.password||"").slice(0,200);if(password.length<8)return send(res,400,{ok:false,error:"WEAK_PASSWORD",message:"Password minimal 8 karakter."});const data=await authRequest("/auth/v1/signup",{method:"POST",body:{email,password,data:{display_name:clean(body.displayName,80)}}});if(data.access_token){setCookies(req,res,data);return send(res,201,publicSession({user:data.user,access:data.access_token,...await membership(data.user)}));}return send(res,201,{ok:true,authenticated:false,confirmationRequired:true,message:"Periksa email untuk mengonfirmasi akun."});}
      if(action==="forgot"){const base=origin(req);if(!base)return send(res,400,{ok:false,error:"INVALID_REQUEST_HOST",message:"Alamat website tidak valid."});const redirect=`${base}/?account=recovery`;await authRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirect)}`,{method:"POST",body:{email:clean(body.email,254).toLowerCase()}});return send(res,200,{ok:true,message:"Tautan pemulihan telah dikirim jika email terdaftar."});}
      const access=clean(body.accessToken,4000),refresh=clean(body.refreshToken,4000);const user=await getAuthUser(access);setCookies(req,res,{access_token:access,refresh_token:refresh,expires_in:Number(body.expiresIn||3600)});return send(res,200,publicSession({user,access,...await membership(user)}));
    }
    if(!validMutation(req))return send(res,403,{ok:false,error:"CSRF_REJECTED"});
    const session=await resolve(req,res);if(!session)return send(res,401,{ok:false,error:"UNAUTHORIZED",message:"Silakan login."});
    if(action==="profile"){const payload={display_name:clean(body.displayName,80),avatar_url:clean(body.avatarUrl,1000)||null};await databaseRequest(`profiles?id=eq.${encodeURIComponent(session.user.id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(payload)});return send(res,200,publicSession(await resolve(req,res)));}
    if(action==="reset-password"){const password=String(body.password||"").slice(0,200);if(password.length<8)return send(res,400,{ok:false,error:"WEAK_PASSWORD",message:"Password minimal 8 karakter."});await authRequest("/auth/v1/user",{method:"PUT",accessToken:session.access,body:{password}});return send(res,200,{ok:true,message:"Password berhasil diperbarui."});}
    return send(res,400,{ok:false,error:"INVALID_ACTION"});
  }catch(error){const status=Math.max(400,Math.min(599,Number(error.status||500))),action=clean(req.body?.action,40).toLowerCase();console.error("[account]",error.code||"UNKNOWN");return send(res,status,{ok:false,error:error.code||"ACCOUNT_FAILED",message:safeAccountMessage(status,action)});}
}

async function authorizeTool(req,res,toolId){if(["OPTIONS","HEAD"].includes(String(req.method||"GET").toUpperCase()))return true;let rows;try{rows=await databaseRequest(`tools?select=access_level&id=eq.${encodeURIComponent(toolId)}&limit=1`,{method:"GET"});}catch(error){send(res,503,{ok:false,error:"MEMBERSHIP_UNAVAILABLE",message:"Status akses tool belum dapat diverifikasi. Coba lagi sesaat."});return false;}if(rows?.[0]?.access_level!=="vvip")return true;let session;try{session=await resolve(req,res);}catch{send(res,503,{ok:false,error:"MEMBERSHIP_UNAVAILABLE",message:"Status membership belum dapat diverifikasi. Coba lagi sesaat."});return false;}if(!session){send(res,401,{ok:false,error:"VVIP_LOGIN_REQUIRED",message:"Login dan membership VVIP diperlukan."});return false;}if(!session.membership.isVvip){send(res,403,{ok:false,error:session.membership.status==="suspended"?"ACCOUNT_SUSPENDED":"VVIP_REQUIRED",message:"Tool ini khusus member VVIP aktif."});return false;}return true;}

module.exports={ACCESS_COOKIE,CSRF_COOKIE,REFRESH_COOKIE,authorizeTool,handleAccount,resolveAccountSession:resolve};
