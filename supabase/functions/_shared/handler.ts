import {
  bounded,
  type Env,
  Fault,
  type Fetcher,
  hash,
  readJson,
  sourceOf,
  Store,
  text,
  titleOf,
} from "./core.ts";
import { Wiki } from "./wiki.ts";
import { translation } from "./translation.ts";
export function handler(
  name: string,
  env: Env = (key) => Deno.env.get(key),
  fetcher: Fetcher = fetch,
) {
  return async (req: Request) => {
    const origin = req.headers.get("origin") || "";
    const allowed = (env("WORLD_CLASSICS_ALLOWED_ORIGINS") ||
      "https://all-tools-nexora.vercel.app").split(",").map((s) => s.trim());
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    if (origin && allowed.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
    const send = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status, headers });
    try {
      if (origin && !allowed.includes(origin)) {
        throw new Fault(403, "ORIGIN_NOT_ALLOWED", "Origin tidak diizinkan.");
      }
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }
      if (req.method !== "POST") {
        throw new Fault(405, "METHOD_NOT_ALLOWED", "Gunakan POST.");
      }
      if (
        !/^application\/json(?:;|$)/i.test(
          req.headers.get("content-type") || "",
        )
      ) throw new Fault(415, "JSON_REQUIRED", "Gunakan JSON.");
      let input: any;
      try {
        input = await readJson(
          new Response(req.body, { headers: req.headers }),
          300000,
        );
      } catch (e) {
        if (e instanceof Fault && e.status === 413) throw e;
        throw new Fault(400, "INVALID_JSON", "JSON tidak valid.");
      }
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Fault(400, "INVALID_INPUT", "Input tidak valid.");
      }
      if (
        ["url", "domain", "prompt", "user_id"].some((k) =>
          Object.hasOwn(input, k)
        )
      ) throw new Fault(400, "UNSUPPORTED_INPUT", "Parameter tidak didukung.");
      const source = sourceOf(input.source);
      const value = name === "wikisource-search"
        ? text(input.query, 120, "Pencarian")
        : titleOf(input.pageTitle);
      const store = new Store(env, fetcher);
      const bearer = req.headers.get("authorization");
      let userId = "";
      if (bearer) {
        if (!/^Bearer [A-Za-z0-9_.-]+$/.test(bearer)) {
          throw new Fault(401, "INVALID_SESSION", "Sesi tidak valid.");
        }
        const auth = await bounded(
          fetcher,
          (env("SUPABASE_URL") || "") + "/auth/v1/user",
          {
            headers: {
              Authorization: bearer,
              apikey: env("SUPABASE_SERVICE_ROLE_KEY") || "",
            },
          },
        );
        if (!auth.ok) {
          throw new Fault(
            401,
            "INVALID_SESSION",
            "Sesi berakhir. Masuk kembali.",
          );
        }
        const user = await readJson(auth);
        if (!user.id) {
          throw new Fault(401, "INVALID_SESSION", "Sesi tidak valid.");
        }
        userId = user.id;
      }
      const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0]
        .trim().slice(0, 80);
      const ipHash = await hash(
        (env("SUPABASE_SERVICE_ROLE_KEY") || "") + "|" + ip,
      );
      const identity = userId ? "user:" + userId : "guest:" + ipHash;
      await store.quota("requests", identity, 60, 1, userId ? 120 : 30);
      await store.quota("requests-project", "shared", 60, 1, 1500);
      const wiki = new Wiki(store, fetcher);
      let result;
      if (name === "wikisource-search") {
        result = await wiki.search(source, value);
      } else if (name === "wikisource-page") {
        result = await wiki.page(source, value);
      } else if (name === "wikisource-chapters") {
        result = await wiki.chapters(
          source,
          value,
          input.cursor === undefined ? "" : titleOf(input.cursor),
        );
      } else if (name === "translate-classic") {
        result = await translation(
          store,
          wiki,
          source,
          value,
          input,
          identity,
          Boolean(userId),
          fetcher,
        );
      } else throw new Fault(404, "NOT_FOUND", "Function tidak tersedia.");
      return send(200, { ok: true, ...result });
    } catch (e) {
      const fault = e instanceof Fault ? e : new Fault(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Reader sementara tidak tersedia. Coba lagi sesaat.",
      );
      if (fault.retryAfter) headers["Retry-After"] = String(fault.retryAfter);
      return send(fault.status, {
        ok: false,
        error: fault.code,
        message: fault.message,
        retryAfter: fault.retryAfter || undefined,
      });
    }
  };
}
