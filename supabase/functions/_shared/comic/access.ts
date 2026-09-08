import {
  bounded,
  type Env,
  Fault,
  type Fetcher,
  hash,
  readJson,
  Store,
} from "../core.ts";
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new Fault(400, "INVALID_ID", "ID chapter tidak valid.");
  }
  return value.toLowerCase();
}
export async function access(
  req: Request,
  store: Store,
  env: Env,
  fetcher: Fetcher,
) {
  let userId = "";
  const bearer = req.headers.get("authorization");
  if (bearer) {
    if (!/^Bearer [A-Za-z0-9_.-]+$/.test(bearer)) {
      throw new Fault(
        401,
        "INVALID_SESSION",
        "Masuk kembali untuk menerjemahkan.",
      );
    }
    const r = await bounded(fetcher, env("SUPABASE_URL") + "/auth/v1/user", {
      headers: {
        Authorization: bearer,
        apikey: env("SUPABASE_SERVICE_ROLE_KEY") || "",
      },
    });
    if (!r.ok) {
      throw new Fault(
        401,
        "INVALID_SESSION",
        "Masuk kembali untuk menerjemahkan.",
      );
    }
    userId = uuid((await readJson(r)).id);
  }
  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0]
    .trim().slice(0, 80);
  const ipHash = await hash(
    (env("SUPABASE_SERVICE_ROLE_KEY") || "") + "|comic|" + ip,
  );
  const subject = userId ? "user:" + userId : "guest:" + ipHash;
  await store.quota("comic-requests", subject, 60, 1, userId ? 180 : 90);
  await store.quota("comic-project-requests", "shared", 60, 1, 1800);
  const [tools, settings] = await Promise.all([
    store.request(
      "tools?id=eq.comicreader&select=access_level,is_active&limit=1",
    ),
    store.request("app_settings?key=eq.comic_translation&select=value&limit=1"),
  ]);
  const tool = tools?.[0], value = settings?.[0]?.value;
  if (!tool || !tool.is_active || !value || value.enabled !== true) {
    throw new Fault(403, "DISABLED", "Translate All sedang dinonaktifkan.");
  }
  if (tool.access_level === "vvip") {
    if (!userId) {
      throw new Fault(
        401,
        "VVIP_REQUIRED",
        "Masuk dengan akun VVIP untuk Translate All.",
      );
    }
    const [profiles, subscriptions, admins] = await Promise.all([
      store.request(
        "profiles?id=eq." + userId + "&select=account_status&limit=1",
      ),
      store.request(
        "subscriptions?user_id=eq." + userId +
          "&select=plan,status,expires_at&limit=1",
      ),
      store.request(
        "admin_users?user_id=eq." + userId +
          "&is_active=eq.true&select=role&limit=1",
      ),
    ]);
    const sub = subscriptions?.[0] || {};
    const active = profiles?.[0]?.account_status !== "suspended" &&
      sub.status !== "suspended" && sub.plan === "vvip" &&
      sub.status === "active" && Date.parse(sub.expires_at) > Date.now();
    if (!admins?.length && !active) {
      throw new Fault(
        403,
        "VVIP_REQUIRED",
        "Translate All memerlukan VVIP aktif.",
      );
    }
  }
  return {
    subject,
    userId,
    ipHash,
    settings: {
      enabled: true,
      sfxDefault: value.sfxDefault === true,
      maxConcurrentPages: Math.max(
        1,
        Math.min(3, Number(value.maxConcurrentPages) || 2),
      ),
    },
  };
}
export type Access = Awaited<ReturnType<typeof access>>;
