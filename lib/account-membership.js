"use strict";

const crypto = require("node:crypto");
const { databaseRequest } = require("./database");
const {
  authRequest,
  getAuthUser,
  parseCookies,
  refreshSession,
  signInWithPassword,
  signOutRemote
} = require("./admin-auth");
const { sendJson: send } = require("./http-response");
const { takeFixedWindow } = require("./memory-store");
const { requestOrigin, verifyCsrfRequest, verifySameOriginRequest } = require("./request-security");
const { isServerAuthorizedTool } = require("./server-access-policy");
const { enforceApiAbuseShield } = require("./api-abuse-shield");

const ACCESS_COOKIE = "nx_account_access";
const REFRESH_COOKIE = "nx_account_refresh";
const CSRF_COOKIE = "nx_account_csrf";
const REFRESH_AGE = 30 * 24 * 60 * 60;
const authAttempts = new Map();

function clean(value, maximum = 200) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
}

function requestIsSecure(request) {
  const forwarded = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  if (forwarded) return forwarded === "https";
  return !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(String(request.headers.host || ""));
}

function cookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path || "/"}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAge || 0))}`
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  return parts.join("; ");
}

function appendCookies(response, values) {
  const existing = response.getHeader("Set-Cookie");
  response.setHeader("Set-Cookie", [
    ...(Array.isArray(existing) ? existing : existing ? [String(existing)] : []),
    ...values
  ]);
}

function setCookies(request, response, session, existingCsrf) {
  const isSecure = requestIsSecure(request);
  const csrf = existingCsrf || crypto.randomBytes(24).toString("base64url");
  appendCookies(response, [
    cookie(ACCESS_COOKIE, session.access_token, {
      path: "/api", maxAge: Math.max(60, Number(session.expires_in || 3600)),
      httpOnly: true, secure: isSecure, sameSite: "Lax"
    }),
    cookie(REFRESH_COOKIE, session.refresh_token, {
      path: "/api/account", maxAge: REFRESH_AGE,
      httpOnly: true, secure: isSecure, sameSite: "Strict"
    }),
    cookie(CSRF_COOKIE, csrf, {
      path: "/", maxAge: REFRESH_AGE, secure: isSecure, sameSite: "Strict"
    })
  ]);
  return csrf;
}

function clearCookies(request, response) {
  const isSecure = requestIsSecure(request);
  appendCookies(response, [
    cookie(ACCESS_COOKIE, "", { path: "/api", maxAge: 0, httpOnly: true, secure: isSecure, sameSite: "Lax" }),
    cookie(REFRESH_COOKIE, "", { path: "/api/account", maxAge: 0, httpOnly: true, secure: isSecure, sameSite: "Strict" }),
    cookie(CSRF_COOKIE, "", { path: "/", maxAge: 0, secure: isSecure, sameSite: "Strict" })
  ]);
}

function validMutation(request) {
  return verifyCsrfRequest(request, CSRF_COOKIE, parseCookies);
}

function clientIp(request) {
  return (String(request.headers?.["x-forwarded-for"] || "").split(",")[0].trim()
    || request.socket?.remoteAddress
    || "unknown").slice(0, 80);
}

function authRate(request, action, email) {
  const key = crypto.createHash("sha256")
    .update(`${clientIp(request)}:${action}:${String(email || "").toLowerCase()}`)
    .digest("hex");
  return takeFixedWindow(authAttempts, key, {
    windowMs: 15 * 60_000,
    limit: action === "login" ? 8 : 12,
    maxEntries: 2_000
  });
}

async function ensureRows(user) {
  await databaseRequest("profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      id: user.id,
      email: user.email || null,
      display_name: clean(user.user_metadata?.display_name || String(user.email || "").split("@")[0], 80)
    }])
  });
  await databaseRequest("subscriptions?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify([{ user_id: user.id }])
  });
}

async function membership(user) {
  await ensureRows(user);
  const [profiles, subscriptions, admins] = await Promise.all([
    databaseRequest(`profiles?select=id,email,display_name,avatar_url,role,account_status,created_at&id=eq.${encodeURIComponent(user.id)}&limit=1`, { method: "GET" }),
    databaseRequest(`subscriptions?select=plan,status,started_at,expires_at,updated_at&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { method: "GET" }),
    databaseRequest(`admin_users?select=role,is_active&user_id=eq.${encodeURIComponent(user.id)}&is_active=eq.true&limit=1`, { method: "GET" }).catch(() => [])
  ]);
  const profile = profiles?.[0] || {};
  const subscription = subscriptions?.[0] || {};
  const isAdmin = Boolean(admins?.[0]);
  const suspended = profile.account_status === "suspended" || subscription.status === "suspended";
  const activeVvip = !suspended
    && subscription.plan === "vvip"
    && subscription.status === "active"
    && subscription.expires_at
    && new Date(subscription.expires_at).getTime() > Date.now();
  return {
    profile: {
      id: user.id,
      email: user.email || profile.email || null,
      displayName: profile.display_name || String(user.email || "").split("@")[0],
      avatarUrl: profile.avatar_url || null,
      accountStatus: profile.account_status || "active"
    },
    membership: {
      role: isAdmin ? "admin" : activeVvip ? "vvip" : "free",
      plan: isAdmin ? "admin" : activeVvip ? "vvip" : "free",
      status: suspended ? "suspended" : isAdmin || activeVvip ? "active" : subscription.expires_at ? "expired" : "free",
      startedAt: subscription.started_at || null,
      expiresAt: subscription.expires_at || null,
      isVvip: isAdmin || activeVvip,
      isAdmin
    }
  };
}

async function resolve(request, response) {
  const cookies = parseCookies(request);
  let access = cookies[ACCESS_COOKIE] || "";
  const refresh = cookies[REFRESH_COOKIE] || "";
  let user = null;
  if (access) {
    try { user = await getAuthUser(access); }
    catch (error) { if (![401, 403].includes(Number(error.status))) throw error; }
  }
  if (!user && refresh) {
    try {
      const session = await refreshSession(refresh);
      access = session.access_token;
      setCookies(request, response, session, cookies[CSRF_COOKIE]);
      user = session.user || await getAuthUser(access);
    } catch {
      clearCookies(request, response);
      return null;
    }
  }
  if (!user?.id) return null;
  return { user, access, ...await membership(user) };
}

function publicSession(session) {
  return session
    ? { ok: true, authenticated: true, user: session.profile, membership: session.membership }
    : { ok: true, authenticated: false, user: null, membership: { role: "guest", plan: "free", status: "guest", isVvip: false, isAdmin: false } };
}

function safeAccountMessage(status, action) {
  if (status === 429) return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
  if (action === "login" && [400, 401, 403, 422].includes(status)) return "Email atau password salah.";
  if (action === "register" && [400, 409, 422].includes(status)) return "Akun sudah terdaftar atau data pendaftaran belum valid.";
  if (action === "adopt-session" && [400, 401, 403].includes(status)) return "Tautan pemulihan tidak valid atau sudah kedaluwarsa.";
  if (status >= 500) return "Layanan akun belum dapat diproses.";
  return "Permintaan akun tidak dapat diproses. Periksa data lalu coba lagi.";
}

function rejectCrossOrigin(response) {
  send(response, 403, { ok: false, error: "ORIGIN_NOT_ALLOWED", message: "Permintaan lintas situs ditolak." });
  return null;
}

async function requireAuthenticatedUser(request, response, options = {}) {
  if (!verifySameOriginRequest(request)) return rejectCrossOrigin(response);
  let session;
  try { session = await resolve(request, response); }
  catch {
    send(response, 503, { ok: false, error: "MEMBERSHIP_UNAVAILABLE", message: "Status akun belum dapat diverifikasi. Coba lagi sesaat." });
    return null;
  }
  if (!session) {
    send(response, 401, {
      ok: false,
      error: options.errorCode || "AUTHENTICATION_REQUIRED",
      message: options.message || "Authentication required."
    });
    return null;
  }
  return session;
}

async function requireEntitlement(request, response, entitlement = "vvip") {
  const session = await requireAuthenticatedUser(request, response, {
    errorCode: entitlement === "vvip" ? "VVIP_LOGIN_REQUIRED" : "AUTHENTICATION_REQUIRED",
    message: entitlement === "vvip" ? "Authentication required for VIP access." : "Authentication required."
  });
  if (!session) return null;
  if (entitlement === "vvip" && !session.membership.isVvip) {
    send(response, 403, {
      ok: false,
      error: session.membership.status === "suspended" ? "ACCOUNT_SUSPENDED" : "VVIP_REQUIRED",
      message: "VIP access required."
    });
    return null;
  }
  return session;
}

async function authorizeTool(request, response, toolId) {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "OPTIONS") return true;
  if (!isServerAuthorizedTool(toolId)) {
    send(response, 403, {
      ok: false,
      error: "SERVER_PERMISSION_UNAVAILABLE",
      message: "Tool ini tidak memiliki gerbang otorisasi server."
    });
    return false;
  }
  if (!verifySameOriginRequest(request)) {
    rejectCrossOrigin(response);
    return false;
  }

  let rows;
  try {
    rows = await databaseRequest(`tools?select=access_level&id=eq.${encodeURIComponent(toolId)}&limit=1`, { method: "GET" });
  } catch {
    send(response, 503, { ok: false, error: "MEMBERSHIP_UNAVAILABLE", message: "Status akses tool belum dapat diverifikasi. Coba lagi sesaat." });
    return false;
  }
  if (rows?.[0]?.access_level !== "vvip") {
    return enforceApiAbuseShield(request, response, toolId, { tier: "free" });
  }
  const session = await requireEntitlement(request, response, "vvip");
  if (!session) return false;
  return enforceApiAbuseShield(request, response, toolId, { tier: "vvip", userId: session.user.id });
}

async function requirePermission(request, response, toolId) {
  return authorizeTool(request, response, toolId);
}

async function handleAccount(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, POST, PATCH, DELETE, OPTIONS");
    return response.status(204).end();
  }
  try {
    if (request.method === "GET") return send(response, 200, publicSession(await resolve(request, response)));
    if (!verifySameOriginRequest(request)) return rejectCrossOrigin(response);

    const contentType = String(request.headers?.["content-type"] || "").toLowerCase();
    if (contentType && !contentType.includes("application/json")) {
      return send(response, 415, { ok: false, error: "UNSUPPORTED_CONTENT_TYPE", message: "Gunakan Content-Type application/json." });
    }

    const body = request.body && typeof request.body === "object" ? request.body : {};
    const action = clean(body.action, 40).toLowerCase();
    if (request.method === "DELETE") {
      if (!validMutation(request)) return send(response, 403, { ok: false, error: "CSRF_REJECTED" });
      const cookies = parseCookies(request);
      await signOutRemote(cookies[ACCESS_COOKIE]);
      clearCookies(request, response);
      return send(response, 200, { ok: true, authenticated: false });
    }
    if (!["POST", "PATCH"].includes(request.method)) return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });

    if (["login", "register", "forgot", "adopt-session"].includes(action)) {
      const email = clean(body.email, 254).toLowerCase();
      const rate = authRate(request, action, email);
      if (!rate.allowed) return send(response, 429, { ok: false, error: "ACCOUNT_RATE_LIMITED", message: safeAccountMessage(429, action), retryAfter: rate.retryAfter });

      if (action === "login") {
        const session = await signInWithPassword(email, String(body.password || "").slice(0, 200));
        setCookies(request, response, session);
        return send(response, 200, publicSession({ user: session.user, access: session.access_token, ...await membership(session.user) }));
      }
      if (action === "register") {
        const password = String(body.password || "").slice(0, 200);
        if (password.length < 8) return send(response, 400, { ok: false, error: "WEAK_PASSWORD", message: "Password minimal 8 karakter." });
        const data = await authRequest("/auth/v1/signup", { method: "POST", body: { email, password, data: { display_name: clean(body.displayName, 80) } } });
        if (data.access_token) {
          setCookies(request, response, data);
          return send(response, 201, publicSession({ user: data.user, access: data.access_token, ...await membership(data.user) }));
        }
        return send(response, 201, { ok: true, authenticated: false, confirmationRequired: true, message: "Periksa email untuk mengonfirmasi akun." });
      }
      if (action === "forgot") {
        const base = requestOrigin(request);
        if (!base) return send(response, 400, { ok: false, error: "INVALID_REQUEST_HOST", message: "Alamat website tidak valid." });
        await authRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(`${base}/?account=recovery`)}`, { method: "POST", body: { email } });
        return send(response, 200, { ok: true, message: "Tautan pemulihan telah dikirim jika email terdaftar." });
      }
      const access = clean(body.accessToken, 4000);
      const refresh = clean(body.refreshToken, 4000);
      const user = await getAuthUser(access);
      setCookies(request, response, { access_token: access, refresh_token: refresh, expires_in: Number(body.expiresIn || 3600) });
      return send(response, 200, publicSession({ user, access, ...await membership(user) }));
    }

    if (!validMutation(request)) return send(response, 403, { ok: false, error: "CSRF_REJECTED" });
    const session = await requireAuthenticatedUser(request, response);
    if (!session) return;
    if (action === "profile") {
      const payload = { display_name: clean(body.displayName, 80), avatar_url: clean(body.avatarUrl, 1000) || null };
      await databaseRequest(`profiles?id=eq.${encodeURIComponent(session.user.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
      return send(response, 200, publicSession(await resolve(request, response)));
    }
    if (action === "reset-password") {
      const password = String(body.password || "").slice(0, 200);
      if (password.length < 8) return send(response, 400, { ok: false, error: "WEAK_PASSWORD", message: "Password minimal 8 karakter." });
      await authRequest("/auth/v1/user", { method: "PUT", accessToken: session.access, body: { password } });
      return send(response, 200, { ok: true, message: "Password berhasil diperbarui." });
    }
    return send(response, 400, { ok: false, error: "INVALID_ACTION" });
  } catch (error) {
    const status = Math.max(400, Math.min(599, Number(error.status || 500)));
    const action = clean(request.body?.action, 40).toLowerCase();
    console.error("[account]", error.code || "UNKNOWN");
    return send(response, status, { ok: false, error: error.code || "ACCOUNT_FAILED", message: safeAccountMessage(status, action) });
  }
}

module.exports = {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  authorizeTool,
  handleAccount,
  requireAuthenticatedUser,
  requireEntitlement,
  requirePermission,
  resolveAccountSession: resolve
};
