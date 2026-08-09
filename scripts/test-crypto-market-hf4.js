const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  handleCryptoMarket,
  normalizeCoinGeckoCoin,
  normalizeCoinPaprikaCoin,
  resetCryptoMarketState
} = require("../lib/crypto-market");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function mockResponse() {
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

function request(method, ip = "198.51.100.10") {
  return { method, headers: { "x-forwarded-for": ip }, socket: {} };
}

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

async function main() {
  const originalFetch = global.fetch;
  const originalKey = process.env.COINGECKO_API_KEY;
  const seen = [];
  try {
    process.env.COINGECKO_API_KEY = "cg_demo_test_secret";
    resetCryptoMarketState();
    global.fetch = async (input, options) => {
      const url = String(input);
      seen.push({ url, options });
      if (url.includes("/coins/markets")) return jsonResponse([{
        id: "bitcoin", symbol: "btc", name: "Bitcoin", image: "https://assets.coingecko.com/coin.png",
        market_cap_rank: 1, current_price: 102000, market_cap: 2000000000000, total_volume: 50000000000,
        high_24h: 104000, low_24h: 99000, price_change_percentage_1h_in_currency: 0.4,
        price_change_percentage_24h_in_currency: 2.5, price_change_percentage_7d_in_currency: 7.2,
        ath: 110000, ath_change_percentage: -7.3, circulating_supply: 19800000, total_supply: 21000000,
        sparkline_in_7d: { price: Array.from({ length: 60 }, (_, index) => 98000 + index * 60) }
      }]);
      if (url.endsWith("/global")) return jsonResponse({ data: {
        total_market_cap: { usd: 3500000000000 }, total_volume: { usd: 150000000000 },
        market_cap_percentage: { btc: 57.1, eth: 12.3 }, active_cryptocurrencies: 15000,
        markets: 1100, market_cap_change_percentage_24h_usd: 1.4
      } });
      if (url.includes("/search/trending")) return jsonResponse({ coins: [{ item: { id: "bitcoin", symbol: "btc", name: "Bitcoin", small: "https://assets.coingecko.com/coin-small.png" } }] });
      throw new Error("Unexpected URL " + url);
    };

    const primary = mockResponse();
    await handleCryptoMarket(request("GET"), primary.response, new URL("https://nexora.test/api/crypto-market?currency=usd&limit=10"));
    assert.equal(primary.captured.status, 200);
    assert.equal(primary.captured.payload.source, "coingecko");
    assert.equal(primary.captured.payload.currency, "usd");
    assert.equal(primary.captured.payload.coins.length, 1);
    assert.equal(primary.captured.payload.coins[0].sparkline.length, 24);
    assert.equal(primary.captured.payload.cache.hit, false);
    assert.ok(seen.some((entry) => entry.options.headers["x-cg-demo-api-key"] === "cg_demo_test_secret"));
    assert.ok(!JSON.stringify(primary.captured.payload).includes("cg_demo_test_secret"), "API key tidak boleh keluar ke browser");

    const cached = mockResponse();
    await handleCryptoMarket(request("GET", "198.51.100.11"), cached.response, new URL("https://nexora.test/api/crypto-market?currency=usd&limit=10"));
    assert.equal(cached.captured.payload.cache.hit, true);
    assert.equal(seen.filter((entry) => entry.url.includes("/coins/markets")).length, 1, "Cache harus menghemat kuota provider");

    delete process.env.COINGECKO_API_KEY;
    resetCryptoMarketState();
    global.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/tickers")) return jsonResponse([{
        id: "btc-bitcoin", name: "Bitcoin", symbol: "BTC", rank: 1,
        circulating_supply: 19800000, total_supply: 21000000,
        quotes: {
          USD: { price: 100000, market_cap: 1980000000000, volume_24h: 45000000000, percent_change_1h: 0.2, percent_change_24h: 1.7, percent_change_7d: 5.8, ath_price: 110000, percent_from_price_ath: -9.1 },
          IDR: { price: 1620000000, market_cap: 32000000000000000, volume_24h: 729000000000000, percent_change_1h: 0.2, percent_change_24h: 1.7, percent_change_7d: 5.8, ath_price: 1782000000, percent_from_price_ath: -9.1 }
        }
      }]);
      if (url.endsWith("/global")) return jsonResponse({ market_cap_usd: 3300000000000, volume_24h_usd: 140000000000, bitcoin_dominance_percentage: 56.9, cryptocurrencies_number: 14500, market_number: 980, market_cap_change_24h: 1.2 });
      throw new Error("Unexpected URL " + url);
    };

    const fallback = mockResponse();
    await handleCryptoMarket(request("GET", "198.51.100.12"), fallback.response, new URL("https://nexora.test/api/crypto-market?currency=idr&limit=25"));
    assert.equal(fallback.captured.status, 200);
    assert.equal(fallback.captured.payload.source, "coinpaprika-fallback");
    assert.equal(fallback.captured.payload.currency, "idr");
    assert.equal(fallback.captured.payload.coins[0].currentPrice, 1620000000);
    assert.match(fallback.captured.payload.warning, /COINGECKO_API_KEY/);

    const invalid = mockResponse();
    await handleCryptoMarket(request("GET", "198.51.100.13"), invalid.response, new URL("https://nexora.test/api/crypto-market?currency=btc&limit=25"));
    assert.equal(invalid.captured.status, 400);
    assert.equal(invalid.captured.payload.error, "INVALID_CURRENCY");

    const method = mockResponse();
    await handleCryptoMarket(request("POST", "198.51.100.14"), method.response, new URL("https://nexora.test/api/crypto-market"));
    assert.equal(method.captured.status, 405);

    const normalizedCg = normalizeCoinGeckoCoin({ id: "safe", image: "javascript:alert(1)", current_price: "1.2", sparkline_in_7d: { price: [1, 2, 3] } });
    assert.equal(normalizedCg.image, null);
    assert.equal(normalizedCg.currentPrice, 1.2);
    const normalizedCp = normalizeCoinPaprikaCoin({ id: "btc", quotes: { USD: { price: 1 } } }, "usd");
    assert.equal(normalizedCp.currentPrice, 1);

    const vercel = JSON.parse(read("vercel.json"));
    assert.ok(vercel.rewrites.some((row) => row.source === "/api/crypto-market" && row.destination.includes("mode=crypto-market")));
    const serverlessFiles = [];
    (function walk(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(target);
        else if (target.endsWith(".js")) serverlessFiles.push(target);
      }
    })(path.join(root, "api"));
    assert.equal(serverlessFiles.length, 12);
    const manifest = JSON.parse(read("assets/module-manifest.json"));
    assert.equal(manifest.tools.cryptomarket, "crypto-market");
    for (const asset of [...manifest.modules["crypto-market"].css, ...manifest.modules["crypto-market"].js]) assert.ok(fs.existsSync(path.join(root, asset)));
    for (const token of ["renderCryptoMarket", "/api/crypto-market?currency=", "CoinPaprika Fallback", "bukan saran finansial"]) assert.ok(read("assets/js/features/crypto-market.js").includes(token));
    assert.ok(read("assets/css/features/crypto-market.css").includes("@media(max-width:420px)"));
    assert.ok(read("database/migrations/008_crypto_market_scanner.sql").includes("on conflict (id) do update"));
    for (const publicFile of ["index.html", "assets/js/core/app.js", "assets/js/features/crypto-market.js", "assets/module-manifest.json"]) {
      assert.ok(!read(publicFile).includes("cg_demo_test_secret"), `${publicFile} membocorkan key`);
    }

    console.log("Crypto Market HF4 tests lulus: CoinGecko server-side, CoinPaprika fallback, cache, validasi, UI lazy, migration, dan 12-function limit aman.");
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.COINGECKO_API_KEY;
    else process.env.COINGECKO_API_KEY = originalKey;
    resetCryptoMarketState();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
