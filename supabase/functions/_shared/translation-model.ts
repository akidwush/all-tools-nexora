import { bounded, Fault, type Fetcher, readJson } from "./core.ts";
import { providerFailure } from "./translation-provider.ts";

// Verified text + image understanding models, NOT image/audio generation models.
// Explicit server configuration is preferred when models.list confirms availability.
export const READER_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
] as const;
const endpoint = "https://generativelanguage.googleapis.com/v1beta/models";
type Selection = { models: string[]; expires: number };
// Per-fetcher isolation also makes tests independent. Bounded, memory-only cache;
// credentials never leave server memory except the Google authentication header.
const selections = new WeakMap<Fetcher, Map<string, Promise<Selection>>>();
function configuration(value: string | undefined) {
  const model = (value || "auto").trim().replace(/^models\//, "");
  if (
    model !== "auto" &&
    !/^gemini-\d+(?:\.\d+)?-(?:flash(?:-lite)?|pro)(?:-preview(?:-\d{2}-\d{2})?)?$/
      .test(model)
  ) {
    throw new Fault(
      503,
      "MODEL_CONFIGURATION",
      "Konfigurasi model terjemahan belum valid.",
    );
  }
  return model;
}
async function discover(
  key: string,
  preferred: string,
  fetcher: Fetcher,
): Promise<Selection> {
  const available = new Set<string>();
  let token = "";
  for (let page = 0; page < 8; page++) {
    const query = new URLSearchParams({ pageSize: "1000" });
    if (token) query.set("pageToken", token);
    const response = await bounded(fetcher, endpoint + "?" + query, {
      headers: { "x-goog-api-key": key },
    }, 10000);
    if (!response.ok) throw await providerFailure(response, "models.list");
    const result = await readJson(response, 2_000_000);
    if (!Array.isArray(result.models)) {
      throw new Fault(
        502,
        "TRANSLATION_MODEL_DISCOVERY",
        "Daftar model terjemahan belum dapat diperiksa.",
      );
    }
    for (const model of result.models) {
      if (
        typeof model.name === "string" &&
        model.supportedGenerationMethods?.includes("generateContent")
      ) {
        available.add(model.name.replace(/^models\//, ""));
      }
    }
    if (!result.nextPageToken) break;
    if (
      typeof result.nextPageToken !== "string" ||
      result.nextPageToken.length > 2048 || page === 7
    ) {
      throw new Fault(
        502,
        "TRANSLATION_MODEL_DISCOVERY",
        "Daftar model terjemahan belum dapat diperiksa.",
      );
    }
    token = result.nextPageToken;
  }
  const models = [...new Set([preferred, ...READER_MODELS])].filter((m) =>
    available.has(m)
  );
  if (!models.length) {
    throw new Fault(
      503,
      "TRANSLATION_MODEL_UNAVAILABLE",
      "Tidak ada model reader yang tersedia untuk akun layanan terjemahan. Admin perlu memeriksa akses model.",
    );
  }
  return { models, expires: Date.now() + 900000 };
}
async function selection(key: string, preferred: string, fetcher: Fetcher) {
  let cache = selections.get(fetcher);
  if (!cache) {
    cache = new Map();
    selections.set(fetcher, cache);
  }
  const id = key + "\n" + preferred;
  let pending = cache.get(id);
  if (pending) {
    const state = await pending;
    if (state.expires > Date.now()) return state;
  }
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  pending = discover(key, preferred, fetcher);
  cache.set(id, pending);
  try {
    return await pending;
  } catch (error) {
    if (cache.get(id) === pending) cache.delete(id);
    throw error;
  }
}
export async function generateTranslation(
  key: string,
  preferred: string | undefined,
  body: unknown,
  fetcher: Fetcher = fetch,
  signal: AbortSignal = AbortSignal.timeout(120000),
  timeoutMs = 75000,
): Promise<{ response: Response; model: string }> {
  const state = await selection(key, configuration(preferred), fetcher);
  const candidates = state.models.slice(0, 3);
  for (const model of candidates) {
    signal.throwIfAborted();
    // Another request may already have confirmed this model is unavailable.
    if (!state.models.includes(model)) continue;
    const response = await bounded(
      fetcher,
      endpoint + "/" + model + ":generateContent",
      {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
    if (response.ok) return { response, model };
    const fault = await providerFailure(response, model);
    if (response.status !== 404) throw fault; // Never multiply charges/retries on quota, auth, timeout or provider outages.
    state.models = state.models.filter((m) => m !== model);
    console.warn("[reader translation]", { code: "MODEL_FALLBACK", model });
  }
  throw new Fault(
    503,
    "TRANSLATION_MODEL_UNAVAILABLE",
    "Model terjemahan sedang tidak tersedia. Admin perlu memeriksa akses model.",
  );
}
