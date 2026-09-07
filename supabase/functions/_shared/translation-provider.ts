import { Fault, readJson } from "./core.ts";

// Normalize common copy/paste wrappers; never print the value or send it to the client.
export function translationKey(raw: string | undefined): string {
  let value = (raw || "").trim().replace(/^GEMINI_API_KEY\s*=\s*/, "");
  for (let i = 0; i < 2; i++) {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1).trim();
  }
  if (!value) {
    throw new Fault(
      503,
      "TRANSLATION_NOT_READY",
      "Layanan terjemahan belum diaktifkan oleh admin.",
    );
  }
  if (value.length > 512 || /\s|[\u0000-\u001f\u007f]/.test(value)) {
    throw new Fault(
      503,
      "TRANSLATION_KEY_INVALID",
      "Kunci layanan terjemahan tidak valid. Admin perlu memperbaruinya.",
    );
  }
  return value;
}

export const paragraphSchema = {
  type: "OBJECT",
  properties: {
    paragraphs: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: { type: "INTEGER" }, translated: { type: "STRING" } },
        required: ["id", "translated"],
      },
    },
  },
  required: ["paragraphs"],
};

export async function providerFailure(
  response: Response,
  model: string,
): Promise<Fault> {
  // Only inspect upstream text for classification. Never return/log raw provider errors:
  // they can echo credentials, project identifiers or submitted source text.
  const body = await readJson(response, 64000).catch(() => ({}));
  const error = body?.error || {};
  const details = Array.isArray(error.details) ? error.details : [];
  const reasons = details.map((d: any) => String(d.reason || "")).join(" ");
  const message = typeof error.message === "string"
    ? error.message.toLowerCase()
    : "";
  const status = String(error.status || "");
  const retryInfo = details.find((d: any) =>
    String(d["@type"] || "").endsWith("RetryInfo")
  );
  const seconds = parseFloat(
    String(retryInfo?.retryDelay || response.headers.get("retry-after") || ""),
  );
  const retry = Number.isFinite(seconds)
    ? Math.max(1, Math.min(86400, Math.ceil(seconds)))
    : 60;
  let fault: Fault;
  if (
    /API_KEY_INVALID|API_KEY_EXPIRED/.test(reasons) ||
    /api key (?:not valid|expired|is invalid)|reported as leaked/.test(
      message,
    ) || response.status === 401
  ) {
    fault = new Fault(
      503,
      "TRANSLATION_KEY_INVALID",
      "Kunci layanan terjemahan tidak valid atau sudah dinonaktifkan. Admin perlu memperbaruinya.",
    );
  } else if (response.status === 403) {
    fault = new Fault(
      503,
      "TRANSLATION_ACCESS_DENIED",
      "Akses layanan terjemahan ditolak. Admin perlu memeriksa izin dan pembatasan API key.",
    );
  } else if (response.status === 404) {
    fault = new Fault(
      503,
      "TRANSLATION_MODEL_UNAVAILABLE",
      "Model terjemahan tidak tersedia untuk akun ini. Admin perlu mengganti model.",
    );
  } else if (response.status === 429) {
    const quota = details.filter((d: any) =>
      String(d["@type"] || "").endsWith("QuotaFailure")
    );
    const quotaText = JSON.stringify(quota).toLowerCase();
    if (/limit:\s*0(?:\D|$)/.test(message)) {
      fault = new Fault(
        429,
        "TRANSLATION_QUOTA_UNAVAILABLE",
        "Akun layanan terjemahan tidak memiliki kuota untuk model ini. Admin perlu memeriksa kuota atau paket akun.",
      );
    } else if (/perday|per_day|daily/.test(quotaText + " " + message)) {
      fault = new Fault(
        429,
        "TRANSLATION_DAILY_QUOTA",
        "Kuota harian layanan terjemahan sudah habis. Coba setelah kuota diperbarui.",
        Math.max(retry, 3600),
      );
    } else {fault = new Fault(
        429,
        "TRANSLATION_RATE_LIMIT",
        "Batas permintaan layanan terjemahan tercapai. Tunggu sebentar sebelum mencoba lagi.",
        retry,
      );}
  } else if (response.status === 400 && status === "FAILED_PRECONDITION") {
    fault = new Fault(
      503,
      "TRANSLATION_ACCOUNT_SETUP",
      "Paket akun atau wilayah server belum memenuhi persyaratan layanan terjemahan. Admin perlu memeriksanya.",
    );
  } else if (response.status === 400) {
    fault = new Fault(
      502,
      "TRANSLATION_REQUEST_REJECTED",
      "Format permintaan terjemahan ditolak oleh layanan. Admin perlu memeriksa konfigurasi penerjemah.",
    );
  } else {fault = new Fault(
      502,
      "TRANSLATION_UNAVAILABLE",
      "Layanan terjemahan sedang tidak tersedia. Coba lagi nanti.",
      response.status >= 500 ? retry : 0,
    );}
  console.warn("[world-classics translation]", {
    code: fault.code,
    providerStatus: response.status,
    model,
  });
  return fault;
}
