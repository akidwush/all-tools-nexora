import { generateTranslation } from "./translation-model.ts";
import { Fault } from "./core.ts";
const listed = (names: string[], token?: string) =>
  Response.json({
    models: names.map((name) => ({
      name: "models/" + name,
      supportedGenerationMethods: ["generateContent"],
    })),
    nextPageToken: token,
  });
function eq(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw Error(JSON.stringify([a, b]));
  }
}
async function rejects(fn: () => unknown, code: string) {
  try {
    await fn();
  } catch (e) {
    eq((e as Fault).code, code);
    return;
  }
  throw Error("Expected failure");
}
Deno.test("model discovery replaces unavailable configured 2.5 and caches selection across pages", async () => {
  let lists = 0, calls = 0;
  const f: typeof fetch = async (url, options) => {
    const u = new URL(String(url));
    eq(u.origin, "https://generativelanguage.googleapis.com");
    eq(new Headers(options?.headers).get("x-goog-api-key"), "private-test-key");
    eq(u.searchParams.has("key"), false);
    if (u.pathname === "/v1beta/models") {
      lists++;
      return listed(["gemini-3.5-flash"]);
    }
    eq(u.pathname, "/v1beta/models/gemini-3.5-flash:generateContent");
    calls++;
    return Response.json({ candidates: [] });
  };
  for (let i = 0; i < 3; i++) {
    const r = await generateTranslation(
      "private-test-key",
      "gemini-2.5-flash",
      {},
      f,
    );
    eq(r.model, "gemini-3.5-flash");
    await r.response.text();
  }
  eq(lists, 1);
  eq(calls, 3);
});
Deno.test("listed model returning 404 falls back and subsequent pages skip broken model", async () => {
  const used: string[] = [];
  const f: typeof fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/v1beta/models") {
      return listed(["gemini-2.5-flash", "gemini-3.5-flash"]);
    }
    used.push(path);
    return path.includes("2.5")
      ? Response.json({ error: { message: "not found" } }, { status: 404 })
      : Response.json({ ok: true });
  };
  for (let i = 0; i < 2; i++) {
    const r = await generateTranslation("test", "gemini-2.5-flash", {}, f);
    eq(r.model, "gemini-3.5-flash");
    await r.response.text();
  }
  eq(used.length, 3);
  eq(used.filter((x) => x.includes("2.5")).length, 1);
});
Deno.test("discovery paginates, rejects image/audio models, no calls when unavailable", async () => {
  let pages = 0, generated = 0;
  const f: typeof fetch = async (url) => {
    const u = new URL(String(url));
    if (u.pathname !== "/v1beta/models") {
      generated++;
      return Response.json({});
    }
    pages++;
    return u.searchParams.has("pageToken")
      ? listed(["gemini-3.1-flash-lite"])
      : listed(["gemini-3.1-flash-image"], "next");
  };
  const r = await generateTranslation("test", "auto", {}, f);
  eq(r.model, "gemini-3.1-flash-lite");
  await r.response.text();
  eq(pages, 2);
  eq(generated, 1);
  await rejects(
    () =>
      generateTranslation(
        "test",
        "auto",
        {},
        async () => listed(["gemini-3.1-flash-image"]),
      ),
    "TRANSLATION_MODEL_UNAVAILABLE",
  );
  await rejects(
    () => generateTranslation("test", "https://attacker.invalid", {}, f),
    "MODEL_CONFIGURATION",
  );
});
Deno.test("quota/auth/provider outages do not fall back to extra billable calls", async () => {
  for (
    const [status, code] of [[429, "TRANSLATION_RATE_LIMIT"], [
      403,
      "TRANSLATION_ACCESS_DENIED",
    ], [503, "TRANSLATION_UNAVAILABLE"]] as const
  ) {
    let calls = 0;
    const f: typeof fetch = async (url) => {
      if (new URL(String(url)).pathname === "/v1beta/models") {
        return listed(["gemini-3.5-flash", "gemini-3.1-flash-lite"]);
      }
      calls++;
      return Response.json({ error: { message: "provider refused" } }, {
        status,
      });
    };
    await rejects(() => generateTranslation("test", "auto", {}, f), code);
    eq(calls, 1);
  }
});
Deno.test("concurrent pages share discovery; expired model list failure is retriable", async () => {
  let lists = 0;
  const f: typeof fetch = async (url) => {
    if (new URL(String(url)).pathname === "/v1beta/models") {
      lists++;
      await new Promise((r) => setTimeout(r, 5));
      return listed(["gemini-3.5-flash"]);
    }
    return Response.json({});
  };
  const results = await Promise.all(
    [1, 2, 3].map(() => generateTranslation("test", "auto", {}, f)),
  );
  await Promise.all(results.map((r) => r.response.text()));
  eq(lists, 1);
  let attempt = 0;
  const retry: typeof fetch = async (url) => {
    if (new URL(String(url)).pathname === "/v1beta/models") {
      attempt++;
      if (attempt === 1) return Response.json({ error: {} }, { status: 503 });
      return listed(["gemini-3.5-flash"]);
    }
    return Response.json({});
  };
  await rejects(
    () => generateTranslation("test", "auto", {}, retry),
    "TRANSLATION_UNAVAILABLE",
  );
  const r = await generateTranslation("test", "auto", {}, retry);
  await r.response.text();
  eq(attempt, 2);
});
