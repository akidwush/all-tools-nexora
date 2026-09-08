import { bounded, Fault, type Fetcher, hash, readJson } from "../core.ts";
export type Manifest = {
  mangaId: string;
  chapterId: string;
  baseUrl: string;
  folder: string;
  hash: string;
  files: string[];
  identities: string[];
};
export function imageOrigin(value: unknown) {
  const u = new URL(String(value));
  if (
    u.protocol !== "https:" || u.port || u.username || u.password || u.search ||
    u.hash || u.pathname !== "/" ||
    !/(?:^|\.)(?:mangadex\.org|mangadex\.network)$/.test(u.hostname)
  ) throw new Fault(502, "SOURCE_INVALID", "Sumber gambar tidak valid.");
  return u.origin;
}
async function md(path: string, fetcher: Fetcher) {
  const r = await bounded(fetcher, "https://api.mangadex.org" + path, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Nexora-Comic-Translate/1.0",
    },
  }, 15000);
  if (!r.ok) {
    throw new Fault(
      502,
      "SOURCE_UNAVAILABLE",
      "Halaman komik sementara tidak tersedia.",
    );
  }
  return readJson(r, 1000000);
}
export async function manifest(
  mangaId: string,
  chapterId: string,
  fetcher: Fetcher,
): Promise<Manifest> {
  const chapter = await md("/chapter/" + chapterId, fetcher);
  if (
    chapter.data?.id !== chapterId ||
    !chapter.data?.relationships?.some((r: any) =>
      r.type === "manga" && r.id === mangaId
    ) || chapter.data?.attributes?.externalUrl
  ) {
    throw new Fault(
      400,
      "CHAPTER_INVALID",
      "Chapter tidak cocok dengan komik.",
    );
  }
  const manga = await md("/manga/" + mangaId, fetcher);
  if (!["safe", "suggestive"].includes(manga.data?.attributes?.contentRating)) {
    throw new Fault(403, "SOURCE_UNSUPPORTED", "Chapter ini tidak didukung.");
  }
  const home = await md("/at-home/server/" + chapterId, fetcher);
  const baseUrl = imageOrigin(home.baseUrl), hashValue = home.chapter?.hash;
  if (typeof hashValue !== "string" || !/^[a-f0-9]{32,64}$/i.test(hashValue)) {
    throw new Fault(502, "SOURCE_INVALID", "Identitas gambar tidak valid.");
  }
  // Use canonical full page identity for both saver and HD reader modes.
  const files = home.chapter?.data;
  if (
    !Array.isArray(files) || !files.length || files.length > 200 ||
    files.some((f) =>
      typeof f !== "string" || f.length > 250 ||
      !/^[a-zA-Z0-9_.-]+\.(?:jpe?g|png|webp)$/i.test(f)
    )
  ) {
    throw new Fault(
      413,
      "CHAPTER_SIZE",
      "Chapter terlalu besar atau format gambar belum didukung.",
    );
  }
  const identities = await Promise.all(
    files.map((f, i) =>
      hash(
        ["comic-v1", "mangadex", mangaId, chapterId, i, hashValue, f].join("|"),
      )
    ),
  );
  return {
    mangaId,
    chapterId,
    baseUrl,
    folder: "data",
    hash: hashValue,
    files,
    identities,
  };
}
export async function imageBytes(
  m: Manifest,
  index: number,
  fetcher: Fetcher,
  signal: AbortSignal,
) {
  const url = imageOrigin(m.baseUrl) + "/" + m.folder + "/" + m.hash + "/" +
    encodeURIComponent(m.files[index]);
  const r = await bounded(fetcher, url, { signal }, 20000);
  if (
    !r.ok ||
    !/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(
      r.headers.get("content-type") || "",
    )
  ) {
    throw new Fault(
      502,
      "IMAGE_UNAVAILABLE",
      "Gambar halaman belum dapat dibaca.",
    );
  }
  const maximum = 8_000_000;
  if (Number(r.headers.get("content-length")) > maximum) {
    throw new Fault(413, "IMAGE_SIZE", "Gambar halaman terlalu besar.");
  }
  const reader = r.body?.getReader();
  if (!reader) {
    throw new Fault(502, "IMAGE_UNAVAILABLE", "Gambar halaman kosong.");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) {
        throw new Fault(413, "IMAGE_SIZE", "Gambar halaman terlalu besar.");
      }
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}
