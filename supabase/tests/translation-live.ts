// Runs only in the authenticated deployment job. Uses a generated fixture, not user content.
// Fails closed before changing deployed secrets/functions. Never print provider bodies or keys.
import { vision } from "../functions/_shared/comic/vision.ts";
import { generateTranslation } from "../functions/_shared/translation-model.ts";
import {
  paragraphSchema,
  translationKey,
} from "../functions/_shared/translation-provider.ts";
import { Fault, readJson } from "../functions/_shared/core.ts";
try {
  const key = translationKey(Deno.env.get("GEMINI_API_KEY"));
  const { response, model } = await generateTranslation(
    key,
    Deno.env.get("WORLD_CLASSICS_MODEL"),
    {
      contents: [{
        role: "user",
        parts: [{
          text:
            'Translate into Indonesian. Return JSON paragraphs with id 0 and translated text: "こんにちは。"',
        }],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: paragraphSchema,
        maxOutputTokens: 4096,
      },
    },
  );
  const result = await readJson(response);
  const candidate = result.candidates?.[0];
  const text = candidate?.content?.parts?.filter((p: any) => !p.thought).map((
    p: any,
  ) => p.text || "").join("");
  const paragraphs = JSON.parse(text || "{}").paragraphs;
  if (
    candidate?.finishReason !== "STOP" || !Array.isArray(paragraphs) ||
    paragraphs.length !== 1 || paragraphs[0].id !== 0 ||
    !/halo|hai|selamat/i.test(paragraphs[0].translated)
  ) {
    throw new Fault(502, "TEXT_PROBE_FAILED", "Text translation probe failed");
  }
  console.log("PASS live Indonesian text translation; model=" + model);
  const bytes = await Deno.readFile(
    new URL("./fixtures/translation-probe.png", import.meta.url),
  );
  const comic = await vision(
    bytes,
    (k) => Deno.env.get(k),
    fetch,
    AbortSignal.timeout(120000),
  );
  if (
    !comic.translation.regions.some((r) =>
      /what|hello/i.test(r.original) && /apa|halo|hai/i.test(r.translated)
    )
  ) {
    throw new Fault(
      502,
      "VISION_PROBE_FAILED",
      "Vision translation probe failed",
    );
  }
  console.log(
    "PASS live image OCR + Indonesian translation + normalized regions; model=" +
      comic.model,
  );
  // Pin the actually tested models for the later secrets/deploy steps, even if
  // an old GitHub variable still names a model that now returns 404.
  const output = Deno.env.get("GITHUB_ENV");
  if (output) {
    await Deno.writeTextFile(
      output,
      "WORLD_CLASSICS_MODEL=" + model + "\nCOMIC_TRANSLATION_MODEL=" +
        comic.model + "\n",
      { append: true },
    );
  }
} catch (error) {
  console.error(
    "DEPLOY BLOCKED: " +
      (error instanceof Fault ? error.code : "TRANSLATION_PROBE_FAILED"),
  );
  Deno.exit(1);
}
