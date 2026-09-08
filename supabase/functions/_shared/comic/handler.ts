import { type Env, Fault, type Fetcher, readJson, Store } from "../core.ts";
import { access } from "./access.ts";
import { cancel, page, prepare, type Vision } from "./service.ts";
export function comicHandler(
  kind: "page" | "chapter",
  env: Env = (k) => Deno.env.get(k),
  fetcher: Fetcher = fetch,
  runVision?: Vision,
) {
  return async (req: Request) => {
    const requestId = crypto.randomUUID();
    const origin = req.headers.get("origin") || "";
    const allowed = (env("WORLD_CLASSICS_ALLOWED_ORIGINS") ||
      "https://all-tools-nexora.vercel.app").split(",").map((x) => x.trim());
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    if (allowed.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
    const send = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status, headers });
    try {
      if (origin && !allowed.includes(origin)) {
        throw new Fault(403, "ORIGIN_NOT_ALLOWED", "Akses ditolak.");
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
          4096,
        );
      } catch (e) {
        if (e instanceof Fault && e.status === 413) throw e;
        throw new Fault(400, "INVALID_INPUT", "Permintaan tidak valid.");
      }
      const keys = kind === "page"
        ? ["jobId", "pageIndex", "targetLanguage"]
        : ["action", "jobId", "mangaId", "chapterId"];
      if (
        !input || Array.isArray(input) || typeof input !== "object" ||
        Object.keys(input).some((k) => !keys.includes(k))
      ) throw new Fault(400, "INVALID_INPUT", "Parameter tidak didukung.");
      if (kind === "chapter" && !["prepare", "cancel"].includes(input.action)) {
        throw new Fault(400, "INVALID_ACTION", "Aksi tidak didukung.");
      }
      const store = new Store(env, fetcher),
        a = await access(req, store, env, fetcher);
      const result = kind === "page"
        ? await page(input, a, store, env, fetcher, runVision)
        : input.action === "cancel"
        ? await cancel(input, a, store)
        : await prepare(input, a, store, fetcher);
      return send(200, { ok: true, ...result });
    } catch (e) {
      const f = e instanceof Fault ? e : new Fault(
        503,
        "COMIC_UNAVAILABLE",
        "Layanan terjemahan sedang tidak tersedia.",
      );
      console.error("[comic translation]", {
        requestId,
        function: "comic-translate-" + kind,
        code: f.code,
        status: f.status,
        // Never log Error.message/stack: upstream errors can contain secrets or text.
        unexpected: !(e instanceof Fault),
      });
      if (f.retryAfter) headers["Retry-After"] = String(f.retryAfter);
      // Safe codes only. Never return provider payloads, keys, or source request details.
      const message = f.status === 429
        ? "Batas Translate All sementara tercapai."
        : f.message;
      return send(f.status, {
        ok: false,
        requestId,
        error: f.code,
        message,
        retryAfter: f.retryAfter,
      });
    }
  };
}
