import {
  paragraphSchema,
  providerFailure,
  translationKey,
} from "./translation-provider.ts";
import { Fault } from "./core.ts";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw Error("Mismatch " + JSON.stringify(a) + " vs " + JSON.stringify(b));
  }
}
Deno.test("translation secrets: normalize quotes/pasted assignment; reject malformed values", () => {
  for (
    const raw of [
      "test-key",
      "  test-key  ",
      '"test-key"',
      "'test-key'",
      'GEMINI_API_KEY="test-key"',
    ]
  ) equal(translationKey(raw), "test-key");
  for (const raw of ["", undefined, "test\nkey", "test key"]) {
    let error: unknown;
    try {
      translationKey(raw);
    } catch (e) {
      error = e;
    }
    if (!(error instanceof Fault)) throw Error("Expected typed secret failure");
  }
  equal(paragraphSchema.type, "OBJECT");
  equal(paragraphSchema.properties.paragraphs.items.required, [
    "id",
    "translated",
  ]);
});
Deno.test("provider error classification and logging never expose upstream key/project/text", async () => {
  const records: unknown[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    records.push(args);
  };
  try {
    const tests: [number, any, string, number?][] = [
      [400, {
        status: "INVALID_ARGUMENT",
        message: "API key not valid SECRET-KEY",
        details: [{ reason: "API_KEY_INVALID" }],
      }, "TRANSLATION_KEY_INVALID"],
      [
        403,
        { message: "API key SECRET-KEY was reported as leaked" },
        "TRANSLATION_KEY_INVALID",
      ],
      [403, {
        message: "project PRIVATE-PROJECT key SECRET-KEY",
        details: [{ reason: "API_KEY_HTTP_REFERRER_BLOCKED" }],
      }, "TRANSLATION_ACCESS_DENIED"],
      [
        404,
        { message: "model missing private source text SOURCE-TEXT" },
        "TRANSLATION_MODEL_UNAVAILABLE",
      ],
      [
        429,
        { message: "Quota exceeded limit: 0, model secret" },
        "TRANSLATION_QUOTA_UNAVAILABLE",
      ],
      [
        429,
        {
          details: [{
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [{
              quotaId: "GenerateRequestsPerDayPerProjectPerModel",
            }],
          }],
        },
        "TRANSLATION_DAILY_QUOTA",
        3600,
      ],
      [
        429,
        {
          details: [{
            "@type": "type.googleapis.com/google.rpc.RetryInfo",
            retryDelay: "7.2s",
          }],
        },
        "TRANSLATION_RATE_LIMIT",
        8,
      ],
      [
        400,
        { status: "FAILED_PRECONDITION", message: "Billing unavailable" },
        "TRANSLATION_ACCOUNT_SETUP",
      ],
      [400, {
        status: "INVALID_ARGUMENT",
        message: "invalid schema SOURCE-TEXT SECRET-KEY",
      }, "TRANSLATION_REQUEST_REJECTED"],
      [
        503,
        { message: "service down SECRET-KEY" },
        "TRANSLATION_UNAVAILABLE",
        60,
      ],
    ];
    for (const [status, error, code, retry] of tests) {
      const fault = await providerFailure(
        Response.json({ error }, { status }),
        "test-model",
      );
      equal(fault.code, code);
      if (retry) equal(fault.retryAfter, retry);
      if (/SECRET-KEY|PRIVATE-PROJECT|SOURCE-TEXT/.test(fault.message)) {
        throw Error("Public error leaked upstream details");
      }
    }
    if (
      /SECRET-KEY|PRIVATE-PROJECT|SOURCE-TEXT/.test(JSON.stringify(records))
    ) throw Error("Log leaked raw error");
    equal(records.length, tests.length);
  } finally {
    console.warn = warn;
  }
});
