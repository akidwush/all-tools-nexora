"use strict";

const {
  normalizeChapter,
  normalizeManga
} = require("./normalizer");

const {
  positiveInt
} = require("./shared");

const {
  resolveProviderConfig
} = require("../provider-endpoints");

const SITE_ORIGIN = "https://doujin.desu.xxx/";
const API_BASE = "https://doujin.desu.xxx/";

// Must match the public DoujinDesu client bundle.
// The bundle derives short-lived keys from this value + current hour.


const HOUR_MS = 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 8_000_000;

const definition = Object.freeze({
  id: "doujindesu",
  label: "DoujinDesu",
  category: "adult-experimental",
  adult: true,
  experimental: true,
  defaultEnabled: false,
  optInRequired: true,
  participatesInSearch: false,
  participatesInFallback: false,
  participatesInExperimentalSearch: true,
  availability: "degraded",
  languages: ["id"],

  capabilities: {
    search: true,
    detail: true,
    chapters: true,
    pages: false,
    experimentalSearch: true,
    languageFilter: false,
    pagination: true,
    translationCompatible: false
  },

  imageHostSuffixes: [
    "doujin.desu.xxx"
  ]
});

const endpointDefinition = Object.freeze({
  id: "experimental-comic:doujindesu",
  group: "experimental-comic",
  label: "DoujinDesu",
  category: "adult-experimental",
  defaultMode: "active",
  networkSupported: true,
  healthUnsupported: false,
  activationSupported: true,

  allowedHosts: [
    "doujin.desu.xxx",
    "sylvatica.my.id"
  ],

  defaultBaseUrl: API_BASE,
  defaultTimeoutMs: 12_000,
  minTimeoutMs: 2_000,
  maxTimeoutMs: 20_000,

  healthPath: "/manga?limit=1&type=doujinshi&sort=latest_chapter",
  healthMethod: "GET",

  editableFields: [
    "baseUrl",
    "timeoutMs",
    "healthPath"
  ],

  unavailableCode: "PROVIDER_UNAVAILABLE"
});

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

function providerError(message, code = "PROVIDER_UNAVAILABLE", status = 502) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

/* -------------------------------------------------------------------------- */
/* Generic response helpers                                                   */
/* -------------------------------------------------------------------------- */

function firstDefined(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value;

  if (
    value &&
    typeof value === "object"
  ) {
    for (const key of [
      "data",
      "items",
      "results",
      "manga",
      "chapters"
    ]) {
      if (Array.isArray(value[key])) {
        return value[key];
      }
    }
  }

  return [];
}

function responseData(payload) {
  if (
    payload &&
    typeof payload === "object"
  ) {
    if (
      payload.data !== undefined &&
      payload.data !== null
    ) {
      return payload.data;
    }

    if (
      payload.result !== undefined &&
      payload.result !== null
    ) {
      return payload.result;
    }
  }

  return payload;
}

function slugFromRow(row) {
  return String(
    firstDefined(
      row?.slug,
      row?.manga_slug,
      row?.url_slug,
      row?.id
    ) || ""
  ).trim();
}

function idFromRow(row) {
  return String(
    firstDefined(
      row?.id,
      row?.manga_id,
      row?.mangaId,
      row?.slug
    ) || ""
  ).trim();
}

function titleFromRow(row) {
  return String(
    firstDefined(
      row?.title,
      row?.name,
      row?.manga_title,
      row?.judul
    ) || "Untitled"
  ).trim();
}

function coverFromRow(row) {
  return firstDefined(
    row?.cover_url,
    row?.coverUrl,
    row?.cover,
    row?.thumbnail,
    row?.image,
    row?.poster
  );
}

function descriptionFromRow(row) {
  return firstDefined(
    row?.description,
    row?.desc,
    row?.synopsis,
    row?.summary
  );
}

function normalizeGenres(row) {
  const genres = firstDefined(
    row?.genres,
    row?.genre,
    row?.genre_list
  );

  if (Array.isArray(genres)) {
    return genres
      .map((item) => {
        if (
          item &&
          typeof item === "object"
        ) {
          return firstDefined(
            item.name,
            item.title,
            item.label
          );
        }

        return item;
      })
      .filter(Boolean)
      .map((item) => String(item));
  }

  if (typeof genres === "string") {
    return genres
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeAuthors(row) {
  const authors = firstDefined(
    row?.authors,
    row?.author,
    row?.artist
  );

  if (Array.isArray(authors)) {
    return authors
      .map((item) => {
        if (
          item &&
          typeof item === "object"
        ) {
          return firstDefined(
            item.name,
            item.title
          );
        }

        return item;
      })
      .filter(Boolean)
      .map((item) => String(item));
  }

  if (typeof authors === "string") {
    return authors
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

/* -------------------------------------------------------------------------- */
/* Manga normalization                                                        */
/* -------------------------------------------------------------------------- */

function mapManga(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const id = idFromRow(row);
  const slug = slugFromRow(row);

  if (!id && !slug) {
    return null;
  }

  const canonicalId = id || slug;
  const canonicalSlug = slug || id;

  return normalizeManga(
    definition.id,
    {
      id: canonicalId,
      title: titleFromRow(row),
      coverUrl: coverFromRow(row),
      description: descriptionFromRow(row),
      authors: normalizeAuthors(row),
      genres: normalizeGenres(row),
      status: firstDefined(
        row.status,
        row.publishing_status
      ),
      language: firstDefined(
        row.language,
        row.lang,
        "id"
      ),
      url: `${SITE_ORIGIN}manga/${encodeURIComponent(canonicalSlug)}`,

      metadata: {
        slug: canonicalSlug,
        type: firstDefined(
          row.type,
          row.manga_type,
          "doujinshi"
        ),
        year: firstDefined(
          row.year,
          row.release_year
        ),
        termList: firstDefined(
          row.term_list,
          row.termList
        )
      }
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Chapter normalization                                                      */
/* -------------------------------------------------------------------------- */

function chapterNumber(row) {
  const value = firstDefined(
    row?.number,
    row?.chapter_number,
    row?.chapter,
    row?.chapterNumber,
    row?.name
  );

  if (value === null) {
    return null;
  }

  const stringValue = String(value).trim();

  const match = stringValue.match(
    /(?:chapter|ch\.?|episode|ep\.?)?\s*([0-9]+(?:\.[0-9]+)?)/i
  );

  return match
    ? match[1]
    : stringValue;
}

function mapChapter(row, mangaId) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const id = String(
    firstDefined(
      row.id,
      row.chapter_id,
      row.chapterId,
      row.slug
    ) || ""
  ).trim();

  if (!id) {
    return null;
  }

  return normalizeChapter(
    definition.id,
    {
      id,
      mangaId,

      title: firstDefined(
        row.title,
        row.name,
        row.chapter_title,
        row.extra
      ),

      number: chapterNumber(row),

      volume: firstDefined(
        row.volume,
        row.volume_number
      ),

      language: firstDefined(
        row.language,
        row.lang,
        "id"
      ),

      publishedAt: firstDefined(
        row.published_at,
        row.publishedAt,
        row.created_at,
        row.createdAt
      ),

      group: firstDefined(
        row.group,
        row.scanlator,
        row.uploader
      ),

      metadata: {
        slug: firstDefined(
          row.slug
        ),
        url: firstDefined(
          row.url,
          row.href
        ),
        displayName: firstDefined(
          row.name,
          row.title
        )
      }
    }
  );
}

/* -------------------------------------------------------------------------- */
/* API request                                                                */
/* -------------------------------------------------------------------------- */

async function requestJson({
  path,
  params,
  fetchImpl,
  timeoutMs,
  signal,
  cacheMs = 15_000
}) {
  if (typeof fetchImpl !== "function") {
    throw providerError(
      "Fetch provider DoujinDesu tidak tersedia.",
      "FETCH_UNAVAILABLE",
      503
    );
  }

  const config = await resolveProviderConfig(
    endpointDefinition,
    {
      fetchImpl,
      timeoutMs,
      signal
    }
  );

  const baseUrl = String(
    config?.baseUrl ||
    endpointDefinition.defaultBaseUrl ||
    API_BASE
  ).replace(/\/+$/, "");

  const url = new URL(
    path.replace(/^\/+/, ""),
    `${baseUrl}/`
  );

  if (params && typeof params === "object") {
    for (const [key, value] of Object.entries(params)) {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        url.searchParams.set(
          key,
          String(value)
        );
      }
    }
  }

  const controller = new AbortController();

  const timeout = Math.max(
    endpointDefinition.minTimeoutMs,
    Math.min(
      Number(config?.timeoutMs) ||
        Number(timeoutMs) ||
        endpointDefinition.defaultTimeoutMs,
      endpointDefinition.maxTimeoutMs
    )
  );

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  const abortHandler = () => {
    try {
      controller.abort();
    } catch {}
  };

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener(
        "abort",
        abortHandler,
        { once: true }
      );
    }
  }

  try {
    const kuronekoUrl = new URL("https://sylvatica.my.id/api/ai/provider");
    const payloadReq = {
      action: "doujindesu",
      input: {
        url: url.toString()
      }
    };

    const response = await fetchImpl(
      kuronekoUrl.toString(),
      {
        method: "POST",
        signal: controller.signal,
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${process.env.KURONEKO_API_KEY || "test-key"}`,
          "User-Agent": "Nexora-ComicReader/1.0"
        },
        body: JSON.stringify(payloadReq)
      }
    );

    if (!response.ok) {
      throw providerError(
        `DoujinDesu API mengembalikan HTTP ${response.status}.`,
        response.status === 404
          ? "UPSTREAM_NOT_FOUND"
          : "UPSTREAM_HTTP_ERROR",
        response.status >= 500
          ? 502
          : response.status
      );
    }

    const contentType =
      String(
        response.headers?.get?.("content-type") ||
        ""
      ).toLowerCase();

    if (
      contentType &&
      !contentType.includes("json") &&
      !contentType.includes("text")
    ) {
      throw providerError(
        "Respons DoujinDesu bukan JSON yang didukung.",
        "UPSTREAM_INVALID_RESPONSE",
        502
      );
    }

    const body = await response.text();

    if (
      body.length >
      MAX_RESPONSE_BYTES
    ) {
      throw providerError(
        "Respons DoujinDesu terlalu besar.",
        "UPSTREAM_RESPONSE_TOO_LARGE",
        502
      );
    }

    let payload;

    try {
      payload = JSON.parse(body);
    } catch {
      throw providerError(
        "Respons DoujinDesu bukan JSON valid.",
        "UPSTREAM_INVALID_JSON",
        502
      );
    }

    return payload;
  } finally {
    clearTimeout(timer);

    if (signal) {
      signal.removeEventListener(
        "abort",
        abortHandler
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Adapter                                                                    */
/* -------------------------------------------------------------------------- */

async function search({
  query = "",
  page = 1,
  limit = 24,
  fetchImpl,
  timeoutMs,
  signal
}) {
  const q = String(query == null ? "" : query).trim().slice(0, 120);

  const currentPage = positiveInt(
    page,
    {
      min: 1,
      max: 100,
      fallback: 1
    }
  );

  const size = positiveInt(
    limit,
    {
      min: 1,
      max: 50,
      fallback: 24
    }
  );

  if (q.length < 2) {
    return {
      items: [],
      hasMore: false,
      page: currentPage
    };
  }

  const payload = await requestJson({
    path: "/manga",
    params: {
      title: q,
      limit: size
    },
    fetchImpl,
    timeoutMs,
    signal,
    cacheMs: 60_000
  });

  const data = responseData(payload);
  const rows = arrayFrom(data);

  const items = rows
    .map(mapManga)
    .filter(Boolean)
    .slice(0, size);

  const pagination =
    payload?.pagination ||
    data?.pagination ||
    null;

  const hasMore =
    Boolean(
      pagination?.hasMore ??
      pagination?.has_more ??
      (rows.length > size)
    );

  return {
    items,
    hasMore,
    page: currentPage,
    total: firstDefined(
      payload?.total,
      data?.total,
      payload?.count,
      data?.count
    )
  };
}

async function getManga({
  id,
  slug,
  titleHint,
  fetchImpl,
  timeoutMs,
  signal
}) {
  const identifier = String(
    slug || id || ""
  ).trim();

  if (!identifier) {
    throw providerError(
      "ID komik DoujinDesu kosong.",
      "INVALID_COMIC_ID",
      400
    );
  }

  const payload = await requestJson({
    path: `/manga/${encodeURIComponent(identifier)}`,
    fetchImpl,
    timeoutMs,
    signal,
    cacheMs: 30_000
  });

  const data = responseData(payload);
  const manga = mapManga(data);

  if (!manga) {
    throw providerError(
      "Detail komik DoujinDesu tidak ditemukan.",
      "UPSTREAM_NOT_FOUND",
      404
    );
  }

  return manga;
}

async function getChapters({
  mangaId,
  language,
  fetchImpl,
  timeoutMs,
  signal
}) {
  const identifier = String(
    mangaId || ""
  ).trim();

  if (!identifier) {
    throw providerError(
      "ID manga DoujinDesu kosong.",
      "INVALID_COMIC_ID",
      400
    );
  }

  const payload = await requestJson({
    path: `/manga/${encodeURIComponent(identifier)}/chapters`,
    params: language
      ? { language }
      : undefined,
    fetchImpl,
    timeoutMs,
    signal,
    cacheMs: 30_000
  });

  const data = responseData(payload);
  const rows = arrayFrom(data);

  const chapters = rows
    .map((row) =>
      mapChapter(row, identifier)
    )
    .filter(Boolean);

  const languages = [
    ...new Set(
      chapters
        .map((chapter) =>
          chapter.language
        )
        .filter(Boolean)
    )
  ].sort();

  return {
    chapters,
    languages
  };
}

async function health({
  fetchImpl,
  timeoutMs,
  signal
}) {
  const started = Date.now();

  try {
    await requestJson({
      path: "/manga",
      params: {
        limit: 1,
        type: "doujinshi",
        sort: "latest_chapter"
      },
      fetchImpl,
      timeoutMs,
      signal,
      cacheMs: 10_000
    });

    return {
      status: "active",
      httpStatus: 200,
      latencyMs: Date.now() - started
    };
  } catch (error) {
    return {
      status: "degraded",
      httpStatus: error?.status || 503,
      latencyMs: Date.now() - started,
      code:
        error?.code ||
        "PROVIDER_UNAVAILABLE",
      message:
        error?.message ||
        "DoujinDesu API tidak merespons."
    };
  }
}

module.exports = {
  definition,
  endpointDefinition,
  search,
  getManga,
  getChapters,
  health
};
