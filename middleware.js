const CACHE_TTL_MS = 2500;
const DEFAULT_MESSAGE = "Nexora sedang dalam pemeliharaan. Coba lagi nanti.";

let cached = {
  at: 0,
  locked: false,
  message: DEFAULT_MESSAGE,
  source: "cold"
};

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function firstConfigured() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = String(arguments[index] || "").trim();
    if (value) return value;
  }
  return "";
}

function isModernSupabaseKey(value) {
  return /^sb_(?:secret|publishable)_/i.test(String(value || ""));
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function bypassPath(pathname) {
  const path = String(pathname || "/");
  return (
    path === "/favicon.svg" ||
    path.startsWith("/assets/") ||
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path === "/api/admin" ||
    path.startsWith("/api/admin/")
  );
}

function lockPayload(message) {
  return {
    ok: false,
    error: "PUBLIC_ACCESS_LOCKED",
    locked: true,
    message: message || DEFAULT_MESSAGE
  };
}

function maintenanceHtml(message) {
  const safeMessage = escapeHtml(message || DEFAULT_MESSAGE);
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#09050f">
<title>Nexora — Maintenance</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:#09050f;color:#f4eefb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{min-height:100vh;display:grid;place-items:center;padding:24px;background:
radial-gradient(circle at 20% 12%,rgba(147,51,234,.16),transparent 34%),
radial-gradient(circle at 82% 88%,rgba(59,130,246,.10),transparent 30%),#09050f}
main{width:min(100%,560px);padding:30px 26px;border:1px solid rgba(196,181,253,.18);border-radius:24px;background:rgba(17,12,25,.94);box-shadow:0 26px 80px rgba(0,0,0,.38)}
.badge{display:inline-flex;align-items:center;gap:8px;padding:7px 11px;border-radius:999px;background:rgba(168,85,247,.12);border:1px solid rgba(192,132,252,.22);color:#d8b4fe;font-size:12px;font-weight:800;letter-spacing:.08em}
.dot{width:8px;height:8px;border-radius:50%;background:#c084fc;box-shadow:0 0 16px rgba(192,132,252,.6)}
h1{margin:20px 0 10px;font-size:clamp(30px,7vw,48px);line-height:1.04;letter-spacing:-.04em}
p{margin:0;color:#b9afc5;font-size:16px;line-height:1.7}
.note{margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);font-size:13px;color:#887d95}
</style>
</head>
<body>
<main>
  <span class="badge"><i class="dot"></i> NEXORA MAINTENANCE</span>
  <h1>Akses publik sedang dikunci.</h1>
  <p>${safeMessage}</p>
  <p class="note">Administrator masih dapat membuka dashboard Nexora untuk mengubah status maintenance.</p>
</main>
</body>
</html>`;
}

async function fetchControlPlane() {
  if (Date.now() - cached.at < CACHE_TTL_MS) return cached;

  const baseUrl = normalizeBaseUrl(process.env.SUPABASE_URL);
  const key = firstConfigured(
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Local/test environment without production Supabase must remain usable.
  if (!baseUrl || !key) {
    cached = {
      at: Date.now(),
      locked: false,
      message: DEFAULT_MESSAGE,
      source: "not-configured"
    };
    return cached;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);

  try {
    const headers = {
      apikey: key,
      Accept: "application/json"
    };
    if (!isModernSupabaseKey(key)) headers.Authorization = `Bearer ${key}`;

    const resource = "app_settings?select=value&key=eq.control_plane&limit=1";
    const response = await fetch(`${baseUrl}/rest/v1/${resource}`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`CONTROL_PLANE_HTTP_${response.status}`);
    }

    const rows = await response.json();
    const value = Array.isArray(rows) && rows[0] && rows[0].value && typeof rows[0].value === "object"
      ? rows[0].value
      : {};
    const publicAccess = value.publicAccess && typeof value.publicAccess === "object"
      ? value.publicAccess
      : {};

    cached = {
      at: Date.now(),
      locked: publicAccess.locked === true,
      message: String(publicAccess.message || DEFAULT_MESSAGE).trim().slice(0, 300) || DEFAULT_MESSAGE,
      source: "supabase"
    };
    return cached;
  } finally {
    clearTimeout(timer);
  }
}

function unavailableState() {
  return {
    locked: true,
    message: "Status akses Nexora belum dapat diverifikasi. Coba lagi sesaat.",
    source: "fail-closed"
  };
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (bypassPath(url.pathname)) return;

  let state;
  try {
    state = await fetchControlPlane();
  } catch (error) {
    console.error("[routing-public-lock]", error && error.message ? error.message : String(error));
    state = unavailableState();
  }

  if (!state.locked) return;

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify(lockPayload(state.message)), {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "Retry-After": "60"
      }
    });
  }

  return new Response(maintenanceHtml(state.message), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Retry-After": "60",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}
