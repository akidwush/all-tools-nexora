import {
  bounded,
  Fault,
  type Fetcher,
  hash,
  originalUrl,
  readJson,
  type Source,
  SOURCES,
  type Store,
  titleOf,
} from "./core.ts";
import { sanitize } from "./sanitize.ts";
export class Wiki {
  constructor(public store: Store, public fetcher: Fetcher = fetch) {}
  async api(source: Source, params: Record<string, string>) {
    const q = new URLSearchParams({
      format: "json",
      formatversion: "2",
      ...params,
    });
    try {
      const r = await bounded(
        this.fetcher,
        SOURCES[source].origin + "/w/api.php?" + q,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "NexoraWorldClassics/1.0 (on-demand reader)",
          },
        },
      );
      if (!r.ok) throw Error();
      const data = await readJson(r);
      if (data.error) throw Error();
      return data;
    } catch (e) {
      if (e instanceof Fault) throw e;
      throw new Fault(
        502,
        "SOURCE_UNAVAILABLE",
        "Wikisource sementara tidak tersedia.",
      );
    }
  }
  async cached(
    source: Source,
    title: string,
    type: string,
    ttl: number,
    fetchContent: () => Promise<any>,
  ) {
    const row = await this.store.cache(source, title, type);
    if (row && Date.parse(row.expires_at) > Date.now()) {
      return { ...row.content, cached: true };
    }
    try {
      const content = await fetchContent();
      await this.store.put(source, title, type, content, ttl);
      return { ...content, cached: false };
    } catch (e) {
      if (row && Date.parse(row.expires_at) > Date.now() - 7 * 86400000) {
        return { ...row.content, stale: true, cached: true };
      }
      throw e;
    }
  }
  search(source: Source, query: string) {
    return this.cached(source, query, "search", 43200, async () => {
      const d = await this.api(source, {
        action: "query",
        list: "search",
        srsearch: query,
        srnamespace: "0",
        srlimit: "20",
        srprop: "wordcount",
      });
      return {
        source,
        results: (d.query?.search || []).map((p: any) => ({
          title: p.title,
          pageTitle: p.title,
          wordCount: p.wordcount,
          originalUrl: originalUrl(source, p.title),
        })),
      };
    });
  }
  async page(source: Source, pageTitle: string) {
    const row = await this.store.cache(source, pageTitle, "page");
    if (row && Date.parse(row.expires_at) > Date.now()) {
      if (Date.now() - Date.parse(row.content.checkedAt) < 900000) {
        return { ...row.content, cached: true };
      }
      try {
        const d = await this.api(source, {
          action: "query",
          prop: "revisions",
          titles: pageTitle,
          rvprop: "ids",
          redirects: "1",
        });
        const revision = String(
          d.query?.pages?.[0]?.revisions?.[0]?.revid || "",
        );
        if (revision && revision === row.content.revisionId) {
          const content = {
            ...row.content,
            checkedAt: new Date().toISOString(),
          };
          await this.store.put(source, pageTitle, "page", content, 259200);
          return { ...content, cached: true };
        }
      } catch {
        return { ...row.content, stale: true, cached: true };
      }
    }
    try {
      const d = await this.api(source, {
        action: "parse",
        page: pageTitle,
        prop: "text|revid|displaytitle",
        redirects: "1",
        disableeditsection: "1",
      });
      if (!d.parse?.text) {
        throw new Fault(404, "PAGE_NOT_FOUND", "Halaman tidak ditemukan.");
      }
      const normalized = sanitize(d.parse.text, source);
      const content = {
        source,
        pageTitle,
        title: d.parse.title || pageTitle,
        sourceLabel: SOURCES[source].label,
        originalUrl: originalUrl(source, pageTitle),
        revisionId: String(d.parse.revid || ""),
        checkedAt: new Date().toISOString(),
        ...normalized,
      };
      await this.store.put(source, pageTitle, "page", content, 259200);
      return { ...content, cached: false };
    } catch (e) {
      if (row && Date.parse(row.expires_at) > Date.now() - 7 * 86400000) {
        return { ...row.content, stale: true, cached: true };
      }
      throw e;
    }
  }
  async chapters(source: Source, workTitle: string, cursor = "") {
    if (
      cursor && (!cursor.startsWith(workTitle + "/") || cursor.length > 240)
    ) {
      throw new Fault(
        400,
        "INVALID_CURSOR",
        "Posisi daftar bab tidak valid.",
      );
    }
    const cacheTitle = cursor
      ? "chapters:" + await hash(workTitle + "|" + cursor)
      : workTitle;
    return this.cached(source, cacheTitle, "chapters", 86400, async () => {
      const [links, subs] = await Promise.all([
        cursor ? Promise.resolve({ parse: { links: [] } }) : this.api(source, {
          action: "parse",
          page: workTitle,
          prop: "links",
          redirects: "1",
        }),
        this.api(source, {
          action: "query",
          list: "allpages",
          apprefix: workTitle + "/",
          apnamespace: "0",
          aplimit: "100",
          ...(cursor ? { apcontinue: cursor } : {}),
        }),
      ]);
      const titles: string[] = [];
      for (
        const p of [
          ...(links.parse?.links || []),
          ...(subs.query?.allpages || []),
        ]
      ) {
        const name = p.title || p["*"];
        if (
          p.ns !== 0 || typeof name !== "string" ||
          (!name.startsWith(workTitle + "/") &&
            !(name.startsWith(workTitle) &&
              /第|卷|巻|章|回/.test(name.slice(workTitle.length))))
        ) continue;
        try {
          titleOf(name);
          if (!titles.includes(name)) titles.push(name);
        } catch { /* irrelevant namespace */ }
      }
      return {
        source,
        workTitle,
        chapters: (titles.length ? titles : [workTitle]).map((
          pageTitle,
          order,
        ) => ({
          title: pageTitle === workTitle
            ? "Teks lengkap"
            : pageTitle.slice(workTitle.length + 1),
          pageTitle,
          order,
        })),
        hasMore: Boolean(subs.continue?.apcontinue),
        nextCursor: subs.continue?.apcontinue || null,
      };
    });
  }
}
