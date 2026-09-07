export const SOURCES = Object.freeze({
  china: { origin: "https://zh.wikisource.org", label: "Chinese Wikisource" },
  japan: { origin: "https://ja.wikisource.org", label: "Japanese Wikisource" },
  korea: { origin: "https://ko.wikisource.org", label: "Korean Wikisource" },
});
export type Source = keyof typeof SOURCES;
export class Fault extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
export function sourceOf(value: unknown): Source {
  if (typeof value !== "string" || !Object.hasOwn(SOURCES, value)) {
    throw new Fault(
      400,
      "INVALID_SOURCE",
      "Pilih sumber China, Jepang, atau Korea.",
    );
  }
  return value as Source;
}
export function text(value: unknown, max: number, label: string): string {
  if (typeof value !== "string") {
    throw new Fault(400, "INVALID_INPUT", label + " tidak valid.");
  }
  const clean = value.normalize("NFC").trim();
  if (
    !clean || clean.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean)
  ) {
    throw new Fault(
      400,
      "INVALID_INPUT",
      label + " terlalu panjang atau kosong.",
    );
  }
  return clean;
}
export function titleOf(value: unknown): string {
  const title = text(value, 240, "Judul halaman").replace(/_/g, " ");
  if (/[:#<>\[\]{}|\r\n]/.test(title) || /^https?\//i.test(title)) {
    throw new Fault(
      400,
      "INVALID_TITLE",
      "Hanya halaman karya utama yang didukung.",
    );
  }
  return title;
}
export function modeOf(value: unknown): "Literal" | "Natural" | "Novel" {
  const mode = value ?? "Natural";
  if (!["Literal", "Natural", "Novel"].includes(String(mode))) {
    throw new Fault(400, "INVALID_MODE", "Mode terjemahan tidak didukung.");
  }
  return mode as "Literal" | "Natural" | "Novel";
}
export function originalUrl(source: Source, title: string) {
  return SOURCES[source].origin + "/wiki/" +
    encodeURIComponent(title.replace(/ /g, "_"));
}
export function normalizeText(value: string) {
  return value.normalize("NFC").replace(/\u00a0/g, " ").replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n").trim();
}
export async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(bytes),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export type Env = (name: string) => string | undefined;
export type Fetcher = typeof fetch;
export async function readJson(
  response: Response,
  max = 2_500_000,
): Promise<any> {
  if (Number(response.headers.get("content-length")) > max) {
    throw new Fault(413, "RESPONSE_TOO_LARGE", "Konten sumber terlalu besar.");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Fault(502, "EMPTY_RESPONSE", "Sumber mengirim respons kosong.");
  }
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        throw new Fault(
          413,
          "RESPONSE_TOO_LARGE",
          "Konten sumber terlalu besar.",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(merged));
  } catch {
    throw new Fault(
      502,
      "INVALID_UPSTREAM_JSON",
      "Respons sumber tidak dapat dibaca.",
    );
  }
}
export async function bounded(
  fetcher: Fetcher,
  url: string,
  options: RequestInit = {},
  ms = 12000,
) {
  return await fetcher(url, {
    ...options,
    redirect: "error",
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(ms)])
      : AbortSignal.timeout(ms),
  });
}
export class Store {
  constructor(public env: Env, public fetcher: Fetcher = fetch) {}
  async request(path: string, method = "GET", body?: unknown): Promise<any> {
    const url = this.env("SUPABASE_URL"),
      key = this.env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      throw new Fault(503, "BACKEND_NOT_READY", "Reader belum diaktifkan.");
    }
    const response = await bounded(
      this.fetcher,
      url.replace(/\/$/, "") + "/rest/v1/" + path,
      {
        method,
        headers: {
          apikey: key,
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    if (!response.ok) {
      throw new Fault(
        503,
        "CACHE_UNAVAILABLE",
        "Penyimpanan reader sementara tidak tersedia.",
      );
    }
    return await readJson(response, 3_000_000);
  }
  async cache(source: Source, title: string, type: string) {
    const q = new URLSearchParams({
      source: "eq." + source,
      page_title: "eq." + title,
      content_type: "eq." + type,
      select: "content,expires_at",
      limit: "1",
    });
    return (await this.request("world_classics_cache?" + q))?.[0] || null;
  }
  async put(
    source: Source,
    title: string,
    type: string,
    content: unknown,
    seconds: number,
  ) {
    return await this.request(
      "world_classics_cache?on_conflict=source,page_title,content_type",
      "POST",
      {
        source,
        page_title: title,
        content_type: type,
        content,
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + seconds * 1000).toISOString(),
      },
    );
  }
  async quota(
    scope: string,
    subject: string,
    seconds: number,
    cost: number,
    limit: number,
  ) {
    const ok = await this.request("rpc/wc_take_quota", "POST", {
      p_scope: scope,
      p_subject: subject,
      p_window: seconds,
      p_cost: cost,
      p_limit: limit,
    });
    if (ok !== true) {
      throw new Fault(
        429,
        "RATE_LIMIT",
        "Batas penggunaan sementara tercapai. Coba lagi nanti.",
        seconds,
      );
    }
  }
}
