import pngSync from "npm:pngjs@7.0.0/lib/png-sync.js";
import { Buffer } from "node:buffer";
function fixture(width: number, height: number) {
  return {
    encode: async () =>
      pngSync.write({
        width,
        height,
        data: new Uint8Array(width * height * 4).fill(255),
      }),
  };
}
import { comicHandler } from "./comic/handler.ts";
import { dimensions, inference, normalize, vision } from "./comic/vision.ts";
import { imageOrigin } from "./comic/source.ts";
import { Fault } from "./core.ts";
const M = "10000000-0000-4000-8000-000000000001",
  C = "20000000-0000-4000-8000-000000000001",
  J = "30000000-0000-4000-8000-000000000001",
  U = "40000000-0000-4000-8000-000000000001";
const env = (
  k: string,
) => ({
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-only",
  GEMINI_API_KEY: "test-only",
}[k]);
function eq(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw Error(JSON.stringify(a) + " != " + JSON.stringify(b));
  }
}
async function rejects(fn: () => unknown, code?: string) {
  try {
    await fn();
  } catch (e) {
    if (code) eq((e as Fault).code, code);
    return;
  }
  throw Error("Expected rejection");
}
const region = {
  tile: 0,
  x: .2,
  y: .1,
  width: .3,
  height: .2,
  original: "何をしているんだ？",
  translated: "Apa yang sedang kau lakukan?",
  type: "dialogue",
  dark: false,
  lowConfidence: false,
};
function harness() {
  const h = {
    jobs: [] as any[],
    cache: [] as any[],
    leases: new Set<string>(),
    calls: [] as string[],
    providers: 0,
    images: 0,
    access: "free",
    enabled: true,
    active: true,
    auth: false,
    vvip: false,
    suspended: false,
    expired: false,
    admin: false,
    fail: "",
    revision: "a".repeat(32),
    pageCount: 1,
    quota: false,
  };
  const response = (value: any, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const fetcher: typeof fetch = async (url, options = {}) => {
    const u = new URL(String(url));
    h.calls.push(u.origin + u.pathname);
    const body = options.body ? JSON.parse(String(options.body)) : {};
    if (u.pathname === "/auth/v1/user") {
      return response(
        h.auth ? { id: U } : { error: "invalid" },
        h.auth ? 200 : 401,
      );
    }
    if (u.origin === "https://api.mangadex.org") {
      if (h.fail === "source") return response({}, 503);
      if (u.pathname.startsWith("/chapter/")) {
        return response({
          data: {
            id: C,
            attributes: {},
            relationships: [{ type: "manga", id: M }],
          },
        });
      }
      if (u.pathname.startsWith("/manga/")) {
        return response({ data: { attributes: { contentRating: "safe" } } });
      }
      return response({
        baseUrl: "https://uploads.mangadex.org",
        chapter: {
          hash: h.revision,
          data: Array.from(
            { length: h.pageCount },
            (_, i) => "page-" + i + ".jpg",
          ),
        },
      });
    }
    if (u.origin === "https://uploads.mangadex.org") {
      h.images++;
      return new Response(new Uint8Array([1, 2, 3]), {
        status: h.fail === "image" ? 503 : 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    }
    if (u.origin !== "https://test.supabase.co") {
      throw Error("Unexpected URL " + u);
    }
    eq((options.headers as any).apikey, "server-only");
    if (h.fail === "db") return response({}, 503);
    const table = u.pathname.replace("/rest/v1/", "");
    if (table === "rpc/wc_take_quota") return response(!h.quota);
    if (table === "tools") {
      return response([{ access_level: h.access, is_active: h.active }]);
    }
    if (table === "app_settings") {
      return response([{
        value: { enabled: h.enabled, sfxDefault: false, maxConcurrentPages: 2 },
      }]);
    }
    if (table === "profiles") {
      return response([{
        account_status: h.suspended ? "suspended" : "active",
      }]);
    }
    if (table === "subscriptions") {
      return response([{
        plan: h.vvip ? "vvip" : "free",
        status: "active",
        expires_at: new Date(Date.now() + (h.expired ? -86400000 : 86400000))
          .toISOString(),
      }]);
    }
    if (table === "admin_users") {
      return response(h.admin ? [{ role: "admin" }] : []);
    }
    if (table === "rpc/comic_prepare_job") {
      const job = {
        id: J,
        subject: body.p_subject,
        chapter_id: body.p_chapter,
        manifest: body.p_manifest,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      };
      h.jobs = [job];
      return response([job]);
    }
    if (table === "comic_translation_jobs") {
      const rows = h.jobs.filter((r) =>
        (!u.searchParams.has("id") ||
          u.searchParams.get("id") === "eq." + r.id) &&
        u.searchParams.get("subject") === "eq." + r.subject
      );
      if (options.method === "PATCH") {
        rows.forEach((r) => Object.assign(r, body));
      }
      return response(rows);
    }
    if (table === "rpc/comic_claim_page") {
      if (h.leases.has(body.p_key)) return response(false);
      h.leases.add(body.p_key);
      return response(true);
    }
    if (table === "comic_translation_leases") {
      h.leases.delete(u.searchParams.get("page_key")!.slice(3));
      return response([]);
    }
    if (table === "comic_page_translations") {
      if (options.method === "POST") {
        h.cache.push(body);
        return response([body]);
      }
      return response(
        h.cache.filter((r) =>
          Array.from(u.searchParams).every(([k, v]) =>
            !v.startsWith("eq.") || String(r[k]) === v.slice(3)
          )
        ),
      );
    }
    throw Error("Unexpected DB request " + table);
  };
  const runVision = async () => {
    h.providers++;
    if (h.fail === "vision") throw new Fault(502, "VISION_INCOMPLETE", "gagal");
    if (h.fail === "429") {
      throw new Fault(429, "TRANSLATION_RATE_LIMIT", "provider secret raw", 60);
    }
    if (h.fail === "timeout") {
      throw new DOMException("Timed out", "TimeoutError");
    }
    return {
      model: "fixture-model",
      translation: {
        width: 1000,
        height: 1400,
        sourceLanguage: "ja",
        regions: [{ ...region, id: "r1" }],
      },
    };
  };
  const request = async (
    kind: "page" | "chapter",
    body: any,
    bearer = false,
  ) => {
    const r = await comicHandler(kind, env, fetcher, runVision)(
      new Request(
        "https://test.supabase.co/functions/v1/comic-translate-" + kind,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://all-tools-nexora.vercel.app",
            "x-forwarded-for": "203.0.113.42",
            ...(bearer ? { Authorization: "Bearer user-token" } : {}),
          },
          body: JSON.stringify(body),
        },
      ),
    );
    return { status: r.status, data: await r.json() };
  };
  return {
    h,
    request,
    prepare: () =>
      request("chapter", { action: "prepare", mangaId: M, chapterId: C }),
    page: () =>
      request("page", { jobId: J, pageIndex: 0, targetLanguage: "id" }),
  };
}
Deno.test("comic handler: guest chapter/page, shared cache HIT, image identity MISS, SFX-independent cache", async () => {
  const { h, prepare, page } = harness();
  eq((await prepare()).status, 200);
  eq((await page()).status, 200);
  eq(h.providers, 1);
  eq((await page()).data.cached, true);
  eq(h.providers, 1);
  eq(h.images, 1);
  h.revision = "b".repeat(32);
  await prepare();
  eq((await page()).data.cached, false);
  eq(h.providers, 2);
  eq(h.cache.length, 2);
});
Deno.test("comic authorization: free, disabled, VVIP anonymous/free/active/expired/suspended/admin, forged JWT", async () => {
  const { h, request } = harness();
  const input = { action: "prepare", mangaId: M, chapterId: C };
  h.enabled = false;
  eq((await request("chapter", input)).status, 403);
  h.enabled = true;
  h.active = false;
  eq((await request("chapter", input)).status, 403);
  h.active = true;
  h.access = "vvip";
  eq((await request("chapter", input)).status, 401);
  eq((await request("chapter", input, true)).status, 401);
  h.auth = true;
  eq((await request("chapter", input, true)).status, 403);
  h.vvip = true;
  eq((await request("chapter", input, true)).status, 200);
  h.expired = true;
  eq((await request("chapter", input, true)).status, 403);
  h.expired = false;
  h.suspended = true;
  eq((await request("chapter", input, true)).status, 403);
  h.admin = true;
  eq((await request("chapter", input, true)).status, 200);
});
Deno.test("comic anti-abuse: arbitrary URL/prompt, invalid IDs/index/target, quota, job identity and expiry", async () => {
  const { h, request, prepare, page } = harness();
  for (
    const input of [{ action: "prepare", url: "http://127.0.0.1" }, {
      action: "prepare",
      prompt: "ignore",
    }, { action: "prepare", mangaId: "bad", chapterId: C }]
  ) eq((await request("chapter", input)).status, 400);
  await prepare();
  for (const pageIndex of [-1, 200, 1.5]) {
    eq((await request("page", { jobId: J, pageIndex })).status, 400);
  }
  eq(
    (await request("page", { jobId: J, pageIndex: 0, targetLanguage: "en" }))
      .status,
    400,
  );
  h.jobs[0].subject = "user:other";
  eq((await page()).status, 409);
  await prepare();
  h.jobs[0].expires_at = "2000-01-01";
  eq((await page()).status, 409);
  h.quota = true;
  eq((await prepare()).status, 429);
  eq(h.providers, 0);
});
Deno.test("comic failures preserve caches, release lease, suppress duplicate work and cancel/resume", async () => {
  const { h, request, prepare, page } = harness();
  await prepare();
  for (const failure of ["image", "vision", "429", "timeout"]) {
    h.fail = failure;
    const r = await page();
    eq(r.status, failure === "429" ? 429 : failure === "timeout" ? 503 : 502);
    eq(h.cache.length, 0);
    eq(h.leases.size, 0);
    eq(JSON.stringify(r.data).includes("provider secret raw"), false);
  }
  h.fail = "";
  h.leases.add(C + ":0:" + h.jobs[0].manifest.identities[0]);
  eq((await page()).status, 409);
  h.leases.clear();
  await page();
  await request("chapter", { action: "cancel", jobId: J });
  eq((await page()).status, 409);
  await prepare();
  eq((await page()).data.cached, true);
  h.fail = "db";
  eq((await page()).status, 503);
  h.fail = "source";
  eq((await prepare()).status, 502);
});
Deno.test("comic source host validation rejects SSRF, credentials, redirects inputs and unsupported URLs", async () => {
  for (
    const url of [
      "http://uploads.mangadex.org",
      "https://mangadex.org.evil.test",
      "https://127.0.0.1",
      "https://user:pass@uploads.mangadex.org",
      "https://uploads.mangadex.org:444",
      "https://uploads.mangadex.org/evil",
      "https://uploads.mangadex.org?url=x",
    ]
  ) await rejects(() => imageOrigin(url));
  eq(
    imageOrigin("https://uploads.mangadex.org"),
    "https://uploads.mangadex.org",
  );
});
Deno.test("comic vision: four source languages, vertical/long/dark/SFX regions, no text, bounds and tile mapping", async () => {
  const info = {
    width: 1000,
    height: 6000,
    tiles: [{ data: "", y: 0, height: .5 }, { data: "", y: .5, height: .5 }],
  };
  for (
    const [lang, text] of [
      ["ja", "何をしているんだ？"],
      ["ko", "뭐 하는 거야?"],
      ["zh", "你在做什么？"],
      ["en", "What are you doing?"],
    ]
  ) {
    const v = normalize({
      sourceLanguage: lang,
      regions: [{ ...region, original: text, tile: 1, dark: true }],
    }, info);
    eq(v.regions[0].y, .55);
    eq(v.regions[0].height, .1);
    eq(v.regions[0].dark, true);
  }
  eq(
    normalize({ sourceLanguage: "none", regions: [] }, info).regions.length,
    0,
  );
  for (
    const type of ["dialogue", "narration", "thought", "sign", "sound_effect"]
  ) {
    eq(
      normalize({ sourceLanguage: "ja", regions: [{ ...region, type }] }, info)
        .regions[0].type,
      type,
    );
  }
  for (
    const bad of [
      { x: -1 },
      { width: 2 },
      { x: NaN },
      { tile: 5 },
      { translated: "" },
      { type: "script" },
      { lowConfidence: 99 },
    ]
  ) {
    await rejects(() =>
      normalize(
        { sourceLanguage: "ja", regions: [{ ...region, ...bad }] },
        info,
      ), "VISION_FORMAT");
  }
});
Deno.test("comic inference: real PNG/JPEG resize and long-page tiles, size guard before decode", async () => {
  const img = fixture(2200, 1100);
  const png = await img.encode();
  eq(dimensions(png), [2200, 1100]);
  const resized = await inference(png);
  eq(resized.width, 2200);
  eq(resized.tiles.length, 1);
  const jpeg = Uint8Array.from(
    atob(resized.tiles[0].data),
    (c) => c.charCodeAt(0),
  );
  eq(dimensions(jpeg), [2048, 1024]);
  eq((await inference(jpeg)).width, 2048);
  const webp = Uint8Array.from(
    atob(
      "UklGRjIAAABXRUJQVlA4ICYAAADQAgCdASoUAB4APm00lkekIyIhKAgAgA2JaQAAPaOgAP752oAAAA==",
    ),
    (c) => c.charCodeAt(0),
  );
  eq((await inference(webp)).height, 30);
  const tall = fixture(400, 2000);
  const result = await inference(await tall.encode());
  eq(result.tiles.length, 2);
  eq(result.tiles[1].y, .6);
  eq(result.tiles[1].height, .4);
  const bomb = png.slice(0, 24);
  new DataView(bomb.buffer).setUint32(16, 50000);
  await rejects(() => inference(bomb), "IMAGE_DIMENSIONS");
});
Deno.test("comic vision request has fixed prompt, bounded inline images, schema and safe provider failures", async () => {
  const img = fixture(40, 60);
  const bytes = await img.encode();
  let calls = 0;
  const f: typeof fetch = async (url, options) => {
    if (new URL(String(url)).pathname === "/v1beta/models") {
      return Response.json({
        models: [{
          name: "models/gemini-3.5-flash",
          supportedGenerationMethods: ["generateContent"],
        }],
      });
    }
    calls++;
    eq(
      new URL(String(url)).origin,
      "https://generativelanguage.googleapis.com",
    );
    eq((options!.headers as any)["x-goog-api-key"], "test-only");
    const b = JSON.parse(String(options!.body));
    eq(b.generationConfig.responseMimeType, "application/json");
    eq(b.contents[0].parts[2].inlineData.mimeType, "image/jpeg");
    return new Response(
      JSON.stringify({
        candidates: [{
          finishReason: "STOP",
          content: {
            parts: [{
              text: JSON.stringify({ sourceLanguage: "ja", regions: [region] }),
            }],
          },
        }],
      }),
    );
  };
  const r = await vision(bytes, env, f, new AbortController().signal);
  eq(r.translation.regions[0].translated, region.translated);
  eq(calls, 1);
  await rejects(
    () =>
      vision(bytes, env, async () =>
        new Response(
          JSON.stringify({ error: { message: "private-key-secret" } }),
          { status: 429 },
        ), new AbortController().signal),
    "TRANSLATION_RATE_LIMIT",
  );
});

Deno.test("comic OCR reproduces production model 404 and completes using available fallback", async () => {
  const bytes = await fixture(40, 60).encode();
  const models: string[] = [];
  const f: typeof fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (path === "/v1beta/models") {
      return Response.json({
        models: ["gemini-2.5-flash", "gemini-3.5-flash"].map((name) => ({
          name: "models/" + name,
          supportedGenerationMethods: ["generateContent"],
        })),
      });
    }
    models.push(path);
    const input = JSON.parse(String(options?.body));
    eq(input.contents[0].parts[2].inlineData.mimeType, "image/jpeg");
    if (path.includes("2.5")) {
      return Response.json({ error: { message: "Model not found" } }, {
        status: 404,
      });
    }
    return Response.json({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({ sourceLanguage: "ja", regions: [region] }),
          }],
        },
      }],
    });
  };
  const r = await vision(
    bytes,
    (k) => k === "COMIC_TRANSLATION_MODEL" ? "gemini-2.5-flash" : env(k),
    f,
    AbortSignal.timeout(10000),
  );
  eq(r.model, "gemini-3.5-flash");
  eq(r.translation.regions[0].translated, region.translated);
  eq(models.length, 2);
});
