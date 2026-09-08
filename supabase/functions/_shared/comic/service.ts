import { type Env, Fault, type Fetcher, Store } from "../core.ts";
import { type Access, uuid } from "./access.ts";
import { imageBytes, type Manifest, manifest } from "./source.ts";
import { vision } from "./vision.ts";
export type Vision = typeof vision;
const table = "comic_page_translations";
export async function prepare(
  input: any,
  a: Access,
  store: Store,
  fetcher: Fetcher,
) {
  const mangaId = uuid(input.mangaId), chapterId = uuid(input.chapterId);
  const previous = (await store.request(
    "comic_translation_jobs?subject=eq." + encodeURIComponent(a.subject) +
      "&limit=1",
  ))?.[0];
  if (
    previous && Date.parse(previous.expires_at) > Date.now() &&
    previous.chapter_id !== chapterId
  ) {
    throw new Fault(
      409,
      "JOB_ACTIVE",
      "Selesaikan atau batalkan chapter yang sedang diterjemahkan.",
      5,
    );
  }
  if (
    !previous || previous.chapter_id !== chapterId ||
    Date.parse(previous.expires_at) <= Date.now()
  ) {
    await store.quota("comic-jobs", a.subject, 3600, 1, a.userId ? 12 : 4);
    await store.quota("comic-jobs-ip", a.ipHash, 3600, 1, 16);
  }
  const m = await manifest(mangaId, chapterId, fetcher);
  // Shared subject row (and unique index) prevents multiple active chapter jobs per identity.
  const job = (await store.request("rpc/comic_prepare_job", "POST", {
    p_subject: a.subject,
    p_manga: mangaId,
    p_chapter: chapterId,
    p_manifest: m,
    p_total: m.files.length,
  }))?.[0];
  if (!job) {
    throw new Fault(
      409,
      "JOB_ACTIVE",
      "Chapter lain sedang diterjemahkan. Tunggu atau batalkan dahulu.",
      5,
    );
  }
  const cached = await store.request(
    table + "?" +
      new URLSearchParams({
        provider: "eq.mangadex",
        chapter_id: "eq." + chapterId,
        target_language: "eq.id",
        select: "page_index,image_hash",
        limit: "1000",
      }),
  );
  return {
    jobId: job.id,
    mangaId,
    chapterId,
    totalPages: m.files.length,
    identities: m.identities,
    cachedPages: cached.filter((r: any) =>
      m.identities[r.page_index] === r.image_hash
    ).map((r: any) => r.page_index),
    pageIntervalMs: a.userId ? 3200 : 11000,
    ...a.settings,
  };
}
export async function cancel(input: any, a: Access, store: Store) {
  const id = uuid(input.jobId);
  // Expire rather than remove: in-flight results may finish and populate the shared cache.
  await store.request(
    "comic_translation_jobs?id=eq." + id + "&subject=eq." +
      encodeURIComponent(a.subject),
    "PATCH",
    { expires_at: new Date().toISOString() },
  );
  return { cancelled: true };
}
export async function page(
  input: any,
  a: Access,
  store: Store,
  env: Env,
  fetcher: Fetcher,
  runVision: Vision = vision,
) {
  const jobId = uuid(input.jobId), index = input.pageIndex;
  if (
    !Number.isInteger(index) || index < 0 || index >= 200 ||
    input.targetLanguage !== undefined && input.targetLanguage !== "id"
  ) {
    throw new Fault(
      400,
      "PAGE_INVALID",
      "Halaman atau bahasa tujuan tidak didukung.",
    );
  }
  const job = (await store.request(
    "comic_translation_jobs?id=eq." + jobId + "&subject=eq." +
      encodeURIComponent(a.subject) + "&limit=1",
  ))?.[0];
  if (!job || Date.parse(job.expires_at) <= Date.now()) {
    throw new Fault(
      409,
      "JOB_EXPIRED",
      "Sesi terjemahan berakhir. Tekan Translate All untuk melanjutkan.",
    );
  }
  if (Date.parse(job.expires_at) < Date.now() + 300000) {
    await store.request(
      "comic_translation_jobs?id=eq." + jobId + "&subject=eq." +
        encodeURIComponent(a.subject),
      "PATCH",
      {
        expires_at: new Date(Date.now() + 600000).toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
  }
  const m: Manifest = job.manifest;
  if (index >= m.files.length) {
    throw new Fault(400, "PAGE_INVALID", "Halaman tidak ditemukan.");
  }
  const imageHash = m.identities[index];
  const query = new URLSearchParams({
    provider: "eq.mangadex",
    chapter_id: "eq." + m.chapterId,
    page_index: "eq." + index,
    image_hash: "eq." + imageHash,
    target_language: "eq.id",
    select: "translation",
    limit: "1",
  });
  async function cached() {
    return (await store.request(table + "?" + query))?.[0];
  }
  const hit = await cached();
  if (hit) {
    return {
      pageIndex: index,
      imageHash,
      translation: hit.translation,
      cached: true,
    };
  }
  const key = m.chapterId + ":" + index + ":" + imageHash,
    owner = crypto.randomUUID();
  const claimed = await store.request("rpc/comic_claim_page", "POST", {
    p_key: key,
    p_owner: owner,
    p_job: jobId,
    p_subject: a.subject,
    p_concurrency: a.settings.maxConcurrentPages,
  });
  if (claimed !== true) {
    throw new Fault(
      409,
      "PAGE_BUSY",
      "Halaman sedang diterjemahkan. Coba lagi sebentar.",
      5,
    );
  }
  try {
    const second = await cached();
    if (second) {
      return {
        pageIndex: index,
        imageHash,
        translation: second.translation,
        cached: true,
      };
    }
    await store.quota(
      "comic-pages-minute",
      a.subject,
      60,
      1,
      a.userId ? 20 : 6,
    );
    await store.quota(
      "comic-pages-day",
      a.subject,
      86400,
      1,
      a.userId ? 300 : 60,
    );
    await store.quota("comic-pages-ip", a.ipHash, 60, 1, 24);
    const daily = Math.max(
      1,
      Math.min(10000, Number(env("COMIC_TRANSLATION_DAILY_PAGES")) || 500),
    );
    await store.quota("comic-pages-project", "shared", 86400, 1, daily);
    const signal = AbortSignal.timeout(125000);
    const bytes = await imageBytes(m, index, fetcher, signal);
    const result = await runVision(bytes, env, fetcher, signal);
    await store.request(
      table +
        "?on_conflict=provider,chapter_id,page_index,image_hash,target_language",
      "POST",
      {
        provider: "mangadex",
        manga_id: m.mangaId,
        chapter_id: m.chapterId,
        page_index: index,
        image_hash: imageHash,
        target_language: "id",
        model: result.model,
        translation: result.translation,
        updated_at: new Date().toISOString(),
      },
    );
    return {
      pageIndex: index,
      imageHash,
      translation: result.translation,
      cached: false,
    };
  } finally {
    await store.request(
      "comic_translation_leases?page_key=eq." + encodeURIComponent(key) +
        "&owner=eq." + owner,
      "DELETE",
    ).catch(() => {});
  }
}
