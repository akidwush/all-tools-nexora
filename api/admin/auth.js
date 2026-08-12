const crypto = require("node:crypto");
const {
  clearSessionCookies,
  parseCookies,
  publicSession,
  readAdmin,
  resolveSession,
  setSessionCookies,
  signInWithPassword,
  signOutRemote,
  verifyMutationRequest
} = require("../../lib/admin-auth");
const { databaseRequest } = require("../../lib/database");
const { recordAdminAudit } = require("../../lib/admin-audit");
const { takeFixedWindow } = require("../../lib/memory-store");

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 6;

function send(response, status, payload) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json(payload);
}

function clientIp(request) {
  return (String(request.headers["x-forwarded-for"] || "").split(",")[0].trim() || request.socket?.remoteAddress || "unknown").slice(0, 80);
}

function clean(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function attemptKey(request, email) {
  return crypto.createHash("sha256").update(`${clientIp(request)}:${email.toLowerCase()}`).digest("hex");
}

function allowAttempt(key) {
  return takeFixedWindow(attempts, key, {
    windowMs: WINDOW_MS,
    limit: MAX_ATTEMPTS,
    maxEntries: 1_000
  }).allowed;
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
    return response.status(204).end();
  }

  if (request.method === "GET") {
    try {
      const session = await resolveSession(request, response);
      return send(response, 200, session ? { ok: true, ...publicSession(session) } : { ok: true, authenticated: false });
    } catch (error) {
      console.error("[admin-auth-session]", error.code || "UNKNOWN_ERROR");
      return send(response, 200, { ok: true, authenticated: false });
    }
  }

  if (request.method === "POST") {
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const email = clean(body.email, 254).toLowerCase();
    const password = String(body.password || "").slice(0, 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
      return send(response, 400, { ok: false, error: "INVALID_CREDENTIALS", message: "Email atau kata sandi belum valid." });
    }

    const key = attemptKey(request, email);
    if (!allowAttempt(key)) {
      return send(response, 429, { ok: false, error: "LOGIN_RATE_LIMITED", message: "Terlalu banyak percobaan. Tunggu sekitar 15 menit." });
    }

    try {
      const authSession = await signInWithPassword(email, password);
      const admin = await readAdmin(authSession.user?.id);
      if (!admin) {
        await signOutRemote(authSession.access_token);
        return send(response, 403, { ok: false, error: "ADMIN_NOT_ALLOWED", message: "Akun ini bukan admin aktif." });
      }

      attempts.delete(key);
      setSessionCookies(request, response, authSession);
      const now = new Date().toISOString();
      try {
        await databaseRequest(`admin_users?user_id=eq.${encodeURIComponent(authSession.user.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ last_login_at: now, updated_at: now })
        });
        admin.last_login_at = now;
      } catch {}

      const session = { user: authSession.user, admin };
      const auditLogged = await recordAdminAudit({
        request,
        session,
        action: "auth.login",
        entityType: "admin_session",
        entityId: authSession.user.id,
        summary: `${authSession.user.email || email} login ke dashboard`,
        after: { role: admin.role, lastLoginAt: now }
      });

      return send(response, 200, {
        ok: true,
        auditLogged,
        ...publicSession(session)
      });
    } catch (error) {
      const authRejected = [400, 401, 403, 422].includes(Number(error.status));
      console.error("[admin-login]", error.code || "UNKNOWN_ERROR");
      return send(response, authRejected ? 401 : (error.status || 502), {
        ok: false,
        error: authRejected ? "INVALID_CREDENTIALS" : (error.code || "AUTH_FAILED"),
        message: authRejected ? "Email atau kata sandi salah." : "Layanan login belum dapat dihubungi."
      });
    }
  }

  if (request.method === "DELETE") {
    if (!verifyMutationRequest(request)) {
      return send(response, 403, { ok: false, error: "CSRF_REJECTED" });
    }
    let session = null;
    try { session = await resolveSession(request, response); } catch {}
    if (session) {
      await recordAdminAudit({
        request,
        session,
        action: "auth.logout",
        entityType: "admin_session",
        entityId: session.user.id,
        summary: `${session.user.email || session.user.id} keluar dari dashboard`
      });
    }
    const cookies = parseCookies(request);
    await signOutRemote(cookies.nx_admin_access);
    clearSessionCookies(request, response);
    return send(response, 200, { ok: true });
  }

  response.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
  return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
};
