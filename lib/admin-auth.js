const crypto = require("node:crypto");
const { databaseRequest, getDatabaseConfig } = require("./database");
const { verifyCsrfRequest, verifySameOriginRequest } = require("./request-security");

const ACCESS_COOKIE = "nx_admin_access";
const REFRESH_COOKIE = "nx_admin_refresh";
const CSRF_COOKIE = "nx_admin_csrf";
const DEFAULT_REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

function cleanText(value, maxLength = 200) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function parseCookies(request) {
  const header = String(request.headers.cookie || "");
  return header.split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index < 0) return cookies;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) return cookies;
    try { cookies[name] = decodeURIComponent(value); }
    catch { cookies[name] = value; }
    return cookies;
  }, {});
}

function requestIsSecure(request) {
  const forwarded = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  if (forwarded) return forwarded === "https";
  const host = String(request.headers.host || "");
  return !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}

function cookieValue(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || "/"}`);
  if (Number.isFinite(options.maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  return parts.join("; ");
}

function appendCookies(response, values) {
  const existing = response.getHeader("Set-Cookie");
  const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
  response.setHeader("Set-Cookie", [...list, ...values]);
}

function csrfToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function setSessionCookies(request, response, session, existingCsrf) {
  const secure = requestIsSecure(request);
  const expiresIn = Math.max(60, Number(session.expires_in || 3600));
  const csrf = existingCsrf || csrfToken();
  appendCookies(response, [
    cookieValue(ACCESS_COOKIE, session.access_token, {
      path: "/api/admin",
      maxAge: expiresIn,
      httpOnly: true,
      secure,
      sameSite: "Lax"
    }),
    cookieValue(REFRESH_COOKIE, session.refresh_token, {
      path: "/api/admin",
      maxAge: DEFAULT_REFRESH_MAX_AGE,
      httpOnly: true,
      secure,
      sameSite: "Strict"
    }),
    cookieValue(CSRF_COOKIE, csrf, {
      path: "/",
      maxAge: DEFAULT_REFRESH_MAX_AGE,
      httpOnly: false,
      secure,
      sameSite: "Strict"
    })
  ]);
  return csrf;
}

function clearSessionCookies(request, response) {
  const secure = requestIsSecure(request);
  appendCookies(response, [
    cookieValue(ACCESS_COOKIE, "", { path: "/api/admin", maxAge: 0, httpOnly: true, secure, sameSite: "Lax" }),
    cookieValue(REFRESH_COOKIE, "", { path: "/api/admin", maxAge: 0, httpOnly: true, secure, sameSite: "Strict" }),
    cookieValue(CSRF_COOKIE, "", { path: "/", maxAge: 0, httpOnly: false, secure, sameSite: "Strict" })
  ]);
}

function authConfig() {
  const database = getDatabaseConfig();
  return {
    url: database.url,
    apiKey: database.authApiKey || database.elevatedKey || database.serviceRoleKey,
    configured: Boolean(database.url && (database.authApiKey || database.elevatedKey || database.serviceRoleKey))
  };
}

async function authRequest(path, options = {}) {
  const config = authConfig();
  if (!config.configured) {
    const error = new Error("Supabase Auth belum dikonfigurasi.");
    error.code = "AUTH_NOT_CONFIGURED";
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${config.url}${path}`, {
      method: options.method || "GET",
      signal: controller.signal,
      headers: {
        apikey: config.apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        ...(options.headers || {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; }
    catch { data = raw; }
    if (!response.ok) {
      const error = new Error(cleanText(data?.msg || data?.message || data?.error_description || "Autentikasi gagal.", 300));
      error.code = cleanText(data?.error_code || data?.code || "AUTH_REQUEST_FAILED", 80);
      error.status = response.status;
      error.cause = data;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error("Koneksi autentikasi melewati batas waktu.");
      timeout.code = "AUTH_TIMEOUT";
      timeout.status = 504;
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function signInWithPassword(email, password) {
  return authRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password }
  });
}

async function refreshSession(refreshToken) {
  return authRequest("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: refreshToken }
  });
}

async function getAuthUser(accessToken) {
  return authRequest("/auth/v1/user", { accessToken });
}

async function signOutRemote(accessToken) {
  if (!accessToken) return;
  try { await authRequest("/auth/v1/logout", { method: "POST", accessToken, body: {} }); }
  catch {}
}

function roleCanEdit(role) {
  return role === "super_admin" || role === "admin";
}

function roleCanManageAdmins(role) {
  return role === "super_admin";
}

async function readAdmin(userId) {
  const rows = await databaseRequest(
    `admin_users?select=user_id,role,display_name,is_active,last_login_at,created_at&user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&limit=1`,
    { method: "GET" }
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function resolveSession(request, response) {
  const cookies = parseCookies(request);
  let accessToken = cookies[ACCESS_COOKIE] || "";
  let refreshToken = cookies[REFRESH_COOKIE] || "";
  let user = null;

  if (accessToken) {
    try { user = await getAuthUser(accessToken); }
    catch (error) {
      if (![401, 403].includes(Number(error.status))) throw error;
    }
  }

  if (!user && refreshToken) {
    try {
      const session = await refreshSession(refreshToken);
      accessToken = session.access_token;
      refreshToken = session.refresh_token;
      setSessionCookies(request, response, session, cookies[CSRF_COOKIE]);
      user = session.user || await getAuthUser(accessToken);
    } catch {
      clearSessionCookies(request, response);
      return null;
    }
  }

  if (!user || !user.id) return null;
  const admin = await readAdmin(user.id);
  if (!admin) {
    clearSessionCookies(request, response);
    return null;
  }
  return { user, admin, accessToken, refreshToken };
}

async function requireAdmin(request, response, options = {}) {
  if (!verifySameOriginRequest(request)) {
    const error = new Error("Permintaan lintas situs ditolak.");
    error.code = "ORIGIN_NOT_ALLOWED";
    error.status = 403;
    throw error;
  }
  const session = await resolveSession(request, response);
  if (!session) {
    const error = new Error("Sesi admin tidak tersedia.");
    error.code = "ADMIN_UNAUTHORIZED";
    error.status = 401;
    throw error;
  }
  if (options.edit && !roleCanEdit(session.admin.role)) {
    const error = new Error("Role ini hanya memiliki akses baca.");
    error.code = "ADMIN_FORBIDDEN";
    error.status = 403;
    throw error;
  }
  if (options.manageAdmins && !roleCanManageAdmins(session.admin.role)) {
    const error = new Error("Hanya super admin yang dapat mengelola admin.");
    error.code = "ADMIN_FORBIDDEN";
    error.status = 403;
    throw error;
  }
  return session;
}

function verifyMutationRequest(request) {
  return verifyCsrfRequest(request, CSRF_COOKIE, parseCookies);
}

function publicSession(session) {
  return {
    authenticated: true,
    user: {
      id: session.user.id,
      email: session.user.email || null
    },
    admin: {
      role: session.admin.role,
      displayName: session.admin.display_name || session.user.email?.split("@")[0] || "Admin",
      lastLoginAt: session.admin.last_login_at || null
    },
    permissions: {
      editTools: roleCanEdit(session.admin.role),
      manageAdmins: roleCanManageAdmins(session.admin.role)
    }
  };
}

module.exports = {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  authConfig,
  authRequest,
  clearSessionCookies,
  getAuthUser,
  parseCookies,
  refreshSession,
  publicSession,
  readAdmin,
  requireAdmin,
  resolveSession,
  roleCanEdit,
  roleCanManageAdmins,
  setSessionCookies,
  signInWithPassword,
  signOutRemote,
  verifyMutationRequest
};
