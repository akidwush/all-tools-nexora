const { databaseRequest } = require("../../lib/database");
const { requireAdmin, verifyMutationRequest } = require("../../lib/admin-auth");
const { recordAdminAudit } = require("../../lib/admin-audit");
const { sendJson: send } = require("../../lib/http-response");

const ROUTES = new Set(["/", "/about", "/feedback", "/admin/login", "/admin"]);
const VIEWPORTS = new Set(["mobile", "tablet", "desktop"]);
const STATUSES = new Set(["pass", "warning", "fail", "error"]);
const MAX_THUMBNAIL_LENGTH = 240_000;

function clean(value, max = 300) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}
function safeObject(value, fallback = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return value;
}
function normalizedRoute(value) {
  const route = clean(value, 80) || "/";
  return ROUTES.has(route) ? route : null;
}
function normalizedViewport(value) {
  const viewport = clean(value, 20).toLowerCase();
  return VIEWPORTS.has(viewport) ? viewport : null;
}
function numeric(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
function validHash(value) {
  const hash = clean(value, 128).toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}
function validFingerprint(value) {
  const fingerprint = clean(value, 10_000);
  if (!fingerprint || !/^[A-Za-z0-9+/=_-]+$/.test(fingerprint)) return null;
  return fingerprint;
}
function validThumbnail(value) {
  const thumbnail = String(value || "");
  if (!thumbnail) return null;
  if (thumbnail.length > MAX_THUMBNAIL_LENGTH || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(thumbnail)) return null;
  return thumbnail;
}

async function getBaseline(route, viewport) {
  const rows = await databaseRequest(
    `visual_baselines?select=id,route,viewport,width,height,fingerprint,screenshot_hash,threshold_percent,thumbnail_data_url,created_at,updated_at&route=eq.${encodeURIComponent(route)}&viewport=eq.${encodeURIComponent(viewport)}&limit=1`,
    { method: "GET" }
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function getRuns(route, viewport, limit) {
  const rows = await databaseRequest(
    `visual_test_runs?select=id,route,viewport,status,runtime_errors,resource_errors,console_errors,warnings,difference_percent,screenshot_hash,duration_ms,report,created_at&route=eq.${encodeURIComponent(route)}&viewport=eq.${encodeURIComponent(viewport)}&order=created_at.desc&limit=${limit}`,
    { method: "GET" }
  );
  return Array.isArray(rows) ? rows : [];
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    return response.status(204).end();
  }

  try {
    if (request.method === "GET") {
      await requireAdmin(request, response);
      const route = normalizedRoute(request.query?.route);
      const viewport = normalizedViewport(request.query?.viewport || "mobile");
      if (!route || !viewport) return send(response, 400, { ok: false, error: "INVALID_VISUAL_TARGET" });
      const limit = Math.trunc(numeric(request.query?.limit, 12, 1, 50));
      const [baseline, runs] = await Promise.all([getBaseline(route, viewport), getRuns(route, viewport, limit)]);
      return send(response, 200, { ok: true, baseline, runs, target: { route, viewport } });
    }

    if (request.method === "POST") {
      const body = request.body && typeof request.body === "object" ? request.body : {};
      const action = clean(body.action, 30).toLowerCase();
      const editRequired = action === "set_baseline";
      const session = await requireAdmin(request, response, { edit: editRequired });
      if (!verifyMutationRequest(request)) return send(response, 403, { ok: false, error: "CSRF_REJECTED" });

      const route = normalizedRoute(body.route);
      const viewport = normalizedViewport(body.viewport);
      if (!route || !viewport) return send(response, 400, { ok: false, error: "INVALID_VISUAL_TARGET" });

      if (action === "save_run") {
        const status = clean(body.status, 20).toLowerCase();
        if (!STATUSES.has(status)) return send(response, 400, { ok: false, error: "INVALID_VISUAL_STATUS" });
        const payload = {
          route,
          viewport,
          status,
          runtime_errors: Math.trunc(numeric(body.runtimeErrors, 0, 0, 10000)),
          resource_errors: Math.trunc(numeric(body.resourceErrors, 0, 0, 10000)),
          console_errors: Math.trunc(numeric(body.consoleErrors, 0, 0, 10000)),
          warnings: Math.trunc(numeric(body.warnings, 0, 0, 10000)),
          difference_percent: body.differencePercent == null ? null : numeric(body.differencePercent, 0, 0, 100),
          screenshot_hash: validHash(body.screenshotHash),
          duration_ms: Math.trunc(numeric(body.durationMs, 0, 0, 300000)),
          report: safeObject(body.report),
          created_by: session.user.id
        };
        const rows = await databaseRequest("visual_test_runs", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload)
        });
        return send(response, 200, { ok: true, data: Array.isArray(rows) ? rows[0] || null : null });
      }

      if (action === "set_baseline") {
        const fingerprint = validFingerprint(body.fingerprint);
        const screenshotHash = validHash(body.screenshotHash);
        const thumbnail = validThumbnail(body.thumbnailDataUrl);
        if (!fingerprint || !screenshotHash) return send(response, 400, { ok: false, error: "INVALID_BASELINE_CAPTURE" });
        const previous = await getBaseline(route, viewport);
        const payload = {
          route,
          viewport,
          width: Math.trunc(numeric(body.width, 390, 240, 2560)),
          height: Math.trunc(numeric(body.height, 844, 320, 2000)),
          fingerprint,
          screenshot_hash: screenshotHash,
          threshold_percent: numeric(body.thresholdPercent, 8, 0.5, 40),
          thumbnail_data_url: thumbnail,
          updated_by: session.user.id,
          updated_at: new Date().toISOString()
        };
        const rows = await databaseRequest("visual_baselines?on_conflict=route,viewport", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(payload)
        });
        const baseline = Array.isArray(rows) ? rows[0] || null : null;
        await recordAdminAudit({
          request,
          session,
          action: "visual.baseline.set",
          entityType: "visual_baseline",
          entityId: `${route}:${viewport}`,
          summary: `Baseline visual ${route} (${viewport}) diperbarui`,
          before: previous ? { screenshotHash: previous.screenshot_hash, thresholdPercent: previous.threshold_percent } : null,
          after: { screenshotHash, thresholdPercent: payload.threshold_percent, width: payload.width, height: payload.height }
        });
        return send(response, 200, { ok: true, baseline });
      }

      return send(response, 400, { ok: false, error: "INVALID_VISUAL_ACTION" });
    }

    response.setHeader("Allow", "GET, POST, OPTIONS");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const status = Number(error.status || 500);
    console.error("[admin-visual]", error.code || "UNKNOWN_ERROR", error.postgresCode || "");
    return send(response, status, {
      ok: false,
      error: error.code || "ADMIN_VISUAL_FAILED",
      message: status === 401 ? "Sesi admin berakhir." : status === 403 ? "Akses ditolak." : "Visual QA belum dapat diproses."
    });
  }
};
