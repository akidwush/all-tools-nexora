"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  handleCryptoMarket,
  analyzeTimeframe,
  buildAnalysis,
  normalizeBinanceCandles,
  resetCryptoMarketState
} = require("../lib/crypto-market");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function candles(intervalMs, count = 200, direction = 1) {
  const end = Date.now() - intervalMs * 2;
  return Array.from({ length: count }, (_, index) => {
    const base = 50000 + direction * index * 42 + Math.sin(index / 4) * 18;
    const openTime = end - (count - index) * intervalMs;
    const close = base + direction * 15;
    return [openTime, String(base), String(Math.max(base, close) + 30), String(Math.min(base, close) - 25), String(close), String(100 + index * 1.3), openTime + intervalMs - 1];
  });
}

function responseCapture() {
  const captured = { headers: {} };
  return {
    captured,
    response: {
      setHeader(name, value) { captured.headers[name] = value; },
      status(code) { captured.status = code; return this; },
      json(payload) { captured.payload = payload; return payload; },
      end() { captured.ended = true; }
    }
  };
}

async function main() {
  const originalFetch = global.fetch;
  resetCryptoMarketState();
  try {
    const intervalRows = {
      "15m": candles(15 * 60_000),
      "1h": candles(60 * 60_000),
      "1d": candles(24 * 60 * 60_000, 120)
    };
    const seen = [];
    global.fetch = async (input) => {
      const url = new URL(String(input));
      seen.push(url.toString());
      if (url.hostname === "data-api.binance.vision") {
        const interval = url.searchParams.get("interval");
        assert.equal(url.searchParams.get("symbol"), "BTCUSDT");
        return { ok: true, status: 200, json: async () => intervalRows[interval] };
      }
      if (url.pathname.endsWith("/global")) return { ok: true, status: 200, json: async () => ({ data: { market_cap_change_percentage_24h_usd: 2.4, market_cap_percentage: { btc: 55.7 } } }) };
      throw new Error(`URL tidak diharapkan: ${url}`);
    };

    const output = responseCapture();
    await handleCryptoMarket(
      { method: "GET", headers: { "x-forwarded-for": "203.0.113.60" }, socket: {} },
      output.response,
      new URL("https://nexora.test/api/crypto-market?analysis=1&symbol=BTC&id=bitcoin")
    );
    assert.equal(output.captured.status, 200);
    assert.equal(output.captured.payload.ok, true);
    const result = output.captured.payload.analysis;
    assert.equal(result.asset.pair, "BTCUSDT");
    assert.equal(result.provider, "binance-spot");
    assert.ok(["bullish", "bearish", "neutral"].includes(result.micro.bias));
    assert.ok(["bullish", "bearish", "neutral"].includes(result.macro.bias));
    assert.equal(result.macro.btcDominance, 55.7);
    assert.ok(Number.isFinite(result.timeframes.m15.rsi14));
    assert.ok(Number.isFinite(result.timeframes.h1.macd.histogram));
    assert.ok(Number.isFinite(result.timeframes.d1.atr));
    assert.ok(result.risk.upsideReference > result.timeframes.h1.close);
    assert.ok(result.risk.downsideReference < result.timeframes.h1.close);
    assert.equal(seen.filter((url) => url.includes("data-api.binance.vision")).length, 3);
    for (const interval of ["15m", "1h", "1d"]) assert.ok(seen.some((url) => url.includes(`interval=${interval}`)));

    const invalid = responseCapture();
    await handleCryptoMarket(
      { method: "GET", headers: { "x-forwarded-for": "203.0.113.61" }, socket: {} },
      invalid.response,
      new URL("https://nexora.test/api/crypto-market?analysis=1&symbol=%24BTC&id=bitcoin")
    );
    assert.equal(invalid.captured.status, 400);
    assert.equal(invalid.captured.payload.error, "INVALID_ASSET");

    const now = Date.now();
    const normalized = normalizeBinanceCandles([
      [now - 2000, "1", "2", "0.5", "1.5", "10", now - 1000],
      [now, "1.5", "2", "1", "1.8", "11", now + 60_000]
    ]);
    assert.equal(normalized.length, 1, "candle aktif tidak boleh ikut dihitung");

    const pure = analyzeTimeframe(normalizeBinanceCandles(candles(60_000, 80)), "Tes", 60_000);
    assert.ok(["bullish", "bearish", "neutral"].includes(pure.bias));
    const combined = buildAnalysis("BTC", "bitcoin", { pair: "BTCUSDT", provider: "binance-spot", quality: "exchange-ohlcv", m15: normalizeBinanceCandles(intervalRows["15m"]), h1: normalizeBinanceCandles(intervalRows["1h"]), d1: normalizeBinanceCandles(intervalRows["1d"]) }, null);
    assert.match(combined.disclaimer, /probabilistik/i);

    const client = read("assets/js/features/crypto-market.js");
    for (const token of ["analysis=1", "Analisis 15M · 1H · Makro", "Referensi Risiko", "candle tertutup", "bukan saran"]) assert.ok(client.includes(token));
    const css = read("assets/css/features/crypto-market.css");
    for (const token of [".nx-crypto-timeframes", ".nx-crypto-bias-card", ".nx-crypto-risk", "@media(max-width:430px)"]) assert.ok(css.includes(token));

    console.log("Crypto MTF lulus: candle tertutup Binance 15m/1h/1d, indikator, mikro/makro, referensi risiko, validasi, dan UI responsif aktif.");
  } finally {
    global.fetch = originalFetch;
    resetCryptoMarketState();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
