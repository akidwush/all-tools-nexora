import {
  Fault,
  hash,
  modeOf,
  normalizeText,
  type Source,
  sourceOf,
  Store,
  titleOf,
} from "./core.ts";
import { sanitize } from "./sanitize.ts";
import { Wiki } from "./wiki.ts";
import { translation } from "./translation.ts";
import { handler } from "./handler.ts";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw Error("Expected " + JSON.stringify(b) + "; got " + JSON.stringify(a));
  }
}
async function rejects(fn: () => unknown, code?: string) {
  try {
    await fn();
  } catch (e) {
    if (code) equal((e as Fault).code, code);
    return;
  }
  throw Error("Expected rejection");
}
class Memory extends Store {
  rows = new Map<string, any>();
  translations: any[] = [];
  quotaCount = 0;
  limit = 100;
  held = false;
  constructor() {
    super(
      (k) => ({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "server-only",
        GEMINI_API_KEY: "test-secret",
      }[k]),
    );
  }
  override cache(source: Source, title: string, type: string) {
    return Promise.resolve(
      this.rows.get([source, title, type].join("|")) || null,
    );
  }
  override put(
    source: Source,
    title: string,
    type: string,
    content: unknown,
    ttl: number,
  ) {
    this.rows.set([source, title, type].join("|"), {
      content,
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    });
    return Promise.resolve([]);
  }
  override quota() {
    if (++this.quotaCount > this.limit) {
      return Promise.reject(new Fault(429, "RATE_LIMIT", "limit"));
    }
    return Promise.resolve();
  }
  override request(path: string, method = "GET", body?: any): Promise<any> {
    if (path === "rpc/wc_claim_translation") {
      if (this.held) return Promise.resolve(false);
      this.held = true;
      return Promise.resolve(true);
    }
    if (path.startsWith("world_classics_translation_jobs")) {
      this.held = false;
      return Promise.resolve([]);
    }
    if (path.startsWith("world_classics_translations")) {
      if (method === "POST") {
        this.translations.push(body);
        return Promise.resolve([body]);
      }
      const q = new URLSearchParams(path.split("?")[1]);
      return Promise.resolve(
        this.translations.filter((row) =>
          [
            "source",
            "page_title",
            "target_language",
            "translation_mode",
            "original_hash",
          ].every((k) => "eq." + row[k] === q.get(k))
        ),
      );
    }
    throw Error(path);
  }
}
Deno.test("validation: source whitelist, URL/namespace rejection, modes, normalized SHA256", async () => {
  for (const s of ["https://evil.test", "__proto__", "en", ""]) {
    await rejects(() => sourceOf(s), "INVALID_SOURCE");
  }
  for (const t of ["https://evil.test", "Help:X", "利用者:X", "Work#bad", ""]) {
    await rejects(() => titleOf(t));
  }
  equal(modeOf(undefined), "Natural");
  await rejects(() => modeOf("prompt"), "INVALID_MODE");
  equal(await hash(normalizeText("  本\u00a0 文 ")), await hash("本 文"));
});
Deno.test("sanitization removes executable markup, keeps ruby and footnotes", () => {
  const d = sanitize(
    '<script>alert(1)</script><p onclick="evil()" style="x"><ruby>源<rt>げん</rt><rp>(</rp></ruby> text<a href="javascript:alert(1)">bad</a><a href="#cite_note-1">1</a></p><iframe src="https://evil.test"></iframe><ol><li id="cite_note-1"><em>note</em></li></ol>',
    "japan",
  );
  for (const bad of ["script", "onclick", "style=", "iframe", "javascript:"]) {
    equal(d.html.includes(bad), false);
  }
  equal(d.html.includes("<rt>げん</rt>"), true);
  equal(d.html.includes('href="#cite_note-1"'), true);
  equal(d.paragraphs[0].original, "源 textbad1");
  equal(d.paragraphs[0].html.includes("<ruby>"), true);
});
Deno.test("search MISS, HIT, expiry, stale fallback and fixed official URL", async () => {
  const store = new Memory();
  let calls = 0, fail = false;
  const wiki = new Wiki(store, async (url) => {
    calls++;
    const u = new URL(String(url));
    equal(u.origin, "https://ja.wikisource.org");
    equal(u.pathname, "/w/api.php");
    if (fail) throw Error("offline");
    return Response.json({
      query: { search: [{ title: "源氏物語", wordcount: 20 }] },
    });
  });
  equal((await wiki.search("japan", "源氏")).cached, false);
  equal((await wiki.search("japan", "源氏")).cached, true);
  equal(calls, 1);
  store.rows.get("japan|源氏|search").expires_at = new Date(Date.now() - 1000)
    .toISOString();
  equal((await wiki.search("japan", "源氏")).cached, false);
  equal(calls, 2);
  store.rows.get("japan|源氏|search").expires_at = new Date(Date.now() - 1000)
    .toISOString();
  fail = true;
  equal((await wiki.search("japan", "源氏")).stale, true);
  await rejects(() => wiki.search("korea", "unknown"), "SOURCE_UNAVAILABLE");
});
Deno.test("page cache checks revisions, refreshes changed content and survives source downtime", async () => {
  const store = new Memory();
  let revision = 1, fail = false, calls = 0;
  const wiki = new Wiki(store, async (url) => {
    calls++;
    if (fail) throw Error();
    const u = new URL(String(url));
    if (u.searchParams.get("action") === "query") {
      return Response.json({
        query: { pages: [{ revisions: [{ revid: revision }] }] },
      });
    }
    return Response.json({
      parse: {
        title: "Book",
        revid: revision,
        text: "<p>text " + revision + "</p>",
      },
    });
  });
  equal((await wiki.page("china", "Book")).revisionId, "1");
  equal((await wiki.page("china", "Book")).cached, true);
  equal(calls, 1);
  store.rows.get("china|Book|page").content.checkedAt = new Date(0)
    .toISOString();
  revision = 2;
  equal((await wiki.page("china", "Book")).revisionId, "2");
  store.rows.get("china|Book|page").expires_at = new Date(0).toISOString();
  fail = true;
  await rejects(() => wiki.page("china", "Book"), "SOURCE_UNAVAILABLE");
});
Deno.test("chapter discovery filters namespaces and duplicates", async () => {
  const store = new Memory();
  const wiki = new Wiki(
    store,
    async (url) =>
      new URL(String(url)).searchParams.get("action") === "parse"
        ? Response.json({
          parse: {
            links: [{ ns: 0, title: "Book/First" }, {
              ns: 10,
              title: "Template:X",
            }, { ns: 0, title: "Other" }],
          },
        })
        : Response.json({
          query: {
            allpages: [{ ns: 0, title: "Book/First" }, {
              ns: 0,
              title: "Book/Second",
            }],
          },
        }),
  );
  equal(
    (await wiki.chapters("japan", "Book")).chapters.map((c: any) =>
      c.pageTitle
    ),
    ["Book/First", "Book/Second"],
  );
});
Deno.test("translation cache HIT, mode isolation, content hash invalidation and canonical validation", async () => {
  const store = new Memory();
  let original = "原文", calls = 0;
  const wiki = {
    page: () =>
      Promise.resolve({ revisionId: "1", paragraphs: [{ original }] }),
  } as unknown as Wiki;
  const fake: typeof fetch = async (_url, options) => {
    calls++;
    equal(new Headers(options?.headers).get("x-goog-api-key"), "test-secret");
    const body = JSON.parse(String(options?.body));
    equal(body.generationConfig.responseSchema.type, "OBJECT");
    equal(body.generationConfig.responseJsonSchema, undefined);
    const parts = JSON.parse(body.contents[0].parts[0].text);
    return Response.json({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              paragraphs: parts.map((p: any) => ({
                id: p.id,
                translated: "Terjemahan " + p.id,
              })),
            }),
          }],
        },
      }],
    });
  };
  const run = (mode = "Natural") =>
    translation(
      store,
      wiki,
      "japan",
      "Book",
      { mode, paragraphs: [original] },
      "guest:test",
      false,
      fake,
    );
  equal((await run()).cached, false);
  equal((await run()).cached, true);
  equal(calls, 1);
  await run("Literal");
  equal(calls, 2);
  original = "原文更新";
  await run();
  equal(calls, 3);
  equal(store.translations.length, 3);
  await rejects(
    () =>
      translation(
        store,
        wiki,
        "japan",
        "Book",
        { paragraphs: ["arbitrary user prompt"] },
        "test",
        false,
        fake,
      ),
    "SOURCE_CHANGED",
  );
  equal(calls, 3);
});
Deno.test("provider failure, malformed mapping, rate limit and active lease never write translation cache", async () => {
  const store = new Memory();
  const wiki = {
    page: () => Promise.resolve({ paragraphs: [{ original: "文学" }] }),
  } as unknown as Wiki;
  const run = (f: typeof fetch) =>
    translation(
      store,
      wiki,
      "japan",
      "Book",
      { paragraphs: ["文学"] },
      "guest:test",
      false,
      f,
    );
  await rejects(
    () => run(async () => new Response("", { status: 503 })),
    "TRANSLATION_UNAVAILABLE",
  );
  equal(store.translations.length, 0);
  equal(store.held, false);
  await rejects(
    () =>
      run(async () =>
        Response.json({
          candidates: [{
            finishReason: "STOP",
            content: { parts: [{ text: '{"paragraphs":[]}' }] },
          }],
        })
      ),
    "INVALID_TRANSLATION",
  );
  store.held = true;
  await rejects(() =>
    run(async () => {
      throw Error("must not call provider");
    }), "TRANSLATION_IN_PROGRESS");
  store.held = false;
  store.limit = 0;
  await rejects(() =>
    run(async () => {
      throw Error("must not call provider");
    }), "RATE_LIMIT");
  equal(store.translations.length, 0);
});
Deno.test("HTTP guest, authenticated, invalid auth, CORS, arbitrary URL and durable rate limiting", async () => {
  let exhausted = false, authCalls = 0;
  const env = (
    k: string,
  ) => ({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-only",
  }[k]);
  const fake: typeof fetch = async (url, options) => {
    const u = new URL(String(url));
    if (u.pathname === "/auth/v1/user") {
      authCalls++;
      return new Headers(options?.headers).get("Authorization") ===
          "Bearer valid"
        ? Response.json({ id: "user-a" })
        : new Response("", { status: 401 });
    }
    if (u.pathname.endsWith("wc_take_quota")) return Response.json(!exhausted);
    if (u.pathname.includes("/rest/v1/")) return Response.json([]);
    return Response.json({ query: { search: [] } });
  };
  const endpoint = handler("wikisource-search", env, fake);
  const req = (
    data: unknown,
    auth?: string,
    origin = "https://all-tools-nexora.vercel.app",
  ) =>
    new Request("https://test.supabase.co/functions/v1/wikisource-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(data),
    });
  equal((await endpoint(req({ source: "japan", query: "文学" }))).status, 200);
  equal(
    (await endpoint(req({ source: "japan", query: "文学" }, "Bearer valid")))
      .status,
    200,
  );
  equal(authCalls, 1);
  equal(
    (await endpoint(req({ source: "japan", query: "文学" }, "Bearer invalid")))
      .status,
    401,
  );
  equal(
    (await endpoint(
      req({ source: "japan", query: "文学", url: "http://169.254.169.254" }),
    )).status,
    400,
  );
  equal(
    (await endpoint(
      req({ source: "japan", query: "文学" }, undefined, "https://evil.test"),
    )).status,
    403,
  );
  exhausted = true;
  equal((await endpoint(req({ source: "japan", query: "文学" }))).status, 429);
});
Deno.test("orphan text and nested list paragraphs remain mapped exactly once", () => {
  const d = sanitize(
    "before<br>line<p>middle</p>after<ul><li>outer<ul><li>inner</li></ul></li></ul>",
    "china",
  );
  equal(d.paragraphs.map((p) => p.original), [
    "before\nline",
    "middle",
    "after",
    "outer",
    "inner",
  ]);
});
Deno.test("large paragraph chunking merges fragments, preserves indices and rejects oversized input", async () => {
  const store = new Memory();
  const originals = ["文".repeat(7200), "第二段"];
  const wiki = {
    page: () =>
      Promise.resolve({
        paragraphs: originals.map((original) => ({ original })),
      }),
  } as unknown as Wiki;
  let requests = 0;
  const fake: typeof fetch = async (_url, options) => {
    requests++;
    const data = JSON.parse(String(options?.body));
    const parts = JSON.parse(data.contents[0].parts[0].text);
    return Response.json({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              paragraphs: parts.map((p: any) => ({
                id: p.id,
                translated: "part" + p.id,
              })),
            }),
          }],
        },
      }],
    });
  };
  const result = await translation(
    store,
    wiki,
    "china",
    "Work",
    { paragraphs: originals },
    "user:a",
    true,
    fake,
  );
  equal(requests, 2);
  equal(result.paragraphs.map((p: any) => p.translated), [
    "part0 part1 part2",
    "part3",
  ]);
  equal(result.paragraphs[0].original.length, 7200);
  await rejects(
    () =>
      translation(
        store,
        wiki,
        "china",
        "Work",
        { paragraphs: ["x".repeat(60001)] },
        "user:a",
        true,
        fake,
      ),
    "TRANSLATION_TOO_LARGE",
  );
  const liveWiki = new Wiki(store, async () => {
    throw Error("unexpected upstream request");
  });
  await rejects(
    () => liveWiki.chapters("china", "Work", "Other/page"),
    "INVALID_CURSOR",
  );
});
Deno.test("translation stops queued chunks on provider rejection and keeps the original failure", async () => {
  const store = new Memory();
  const originals = Array.from({ length: 10 }, () => "文".repeat(3000));
  const wiki = {
    page: () =>
      Promise.resolve({
        paragraphs: originals.map((original) => ({ original })),
      }),
  } as unknown as Wiki;
  let calls = 0;
  const fake: typeof fetch = async (_url, options) => {
    calls++;
    if (calls === 1) {
      return Response.json({ error: { message: "Permission denied" } }, {
        status: 403,
      });
    }
    return await new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("aborted", "AbortError"));
      if (options?.signal?.aborted) abort();
      else options?.signal?.addEventListener("abort", abort, { once: true });
    });
  };
  await rejects(
    () =>
      translation(
        store,
        wiki,
        "japan",
        "Book",
        { paragraphs: originals },
        "user:test",
        true,
        fake,
      ),
    "TRANSLATION_ACCESS_DENIED",
  );
  equal(calls, 2);
  equal(store.translations.length, 0);
  equal(store.held, false);
});
