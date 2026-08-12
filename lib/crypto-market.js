const { assertCapacity, setBounded, takeFixedWindow } = require("./memory-store");

const DEFAULT_TIMEOUT_MS = 9_000;
const DEFAULT_CACHE_MS = 60_000;
const STALE_CACHE_MS = 10 * 60_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 40;
const ALLOWED_CURRENCIES = new Set(["usd", "idr"]);
const ALLOWED_LIMITS = new Set([10, 25, 50]);

const responseCache = new Map();
const inFlight = new Map();
const visitors = new Map();

function positiveInteger(value, fallback, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(Math.floor(number), maximum)
    : fallback;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeImage(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function sampled(values, maximum = 24) {
  const rows = (Array.isArray(values) ? values : []).map(finiteNumber).filter((value) => value !== null);
  if (rows.length <= maximum) return rows;
  const result = [];
  for (let index = 0; index < maximum; index += 1) {
    result.push(rows[Math.round((index * (rows.length - 1)) / (maximum - 1))]);
  }
  return result;
}

function normalizeCoinGeckoCoin(row) {
  return {
    id: String(row?.id || "").slice(0, 80),
    symbol: String(row?.symbol || "").toUpperCase().slice(0, 15),
    name: String(row?.name || "Crypto").slice(0, 80),
    image: safeImage(row?.image),
    rank: finiteNumber(row?.market_cap_rank),
    currentPrice: finiteNumber(row?.current_price),
    marketCap: finiteNumber(row?.market_cap),
    volume24h: finiteNumber(row?.total_volume),
    high24h: finiteNumber(row?.high_24h),
    low24h: finiteNumber(row?.low_24h),
    change1h: finiteNumber(row?.price_change_percentage_1h_in_currency),
    change24h: finiteNumber(row?.price_change_percentage_24h_in_currency ?? row?.price_change_percentage_24h),
    change7d: finiteNumber(row?.price_change_percentage_7d_in_currency),
    ath: finiteNumber(row?.ath),
    athChange: finiteNumber(row?.ath_change_percentage),
    circulatingSupply: finiteNumber(row?.circulating_supply),
    totalSupply: finiteNumber(row?.total_supply),
    sparkline: sampled(row?.sparkline_in_7d?.price)
  };
}

function normalizeCoinPaprikaCoin(row, currency) {
  const quotes = row?.quotes && typeof row.quotes === "object" ? row.quotes : {};
  const quote = quotes[currency.toUpperCase()] || quotes.USD || {};
  return {
    id: String(row?.id || "").slice(0, 80),
    symbol: String(row?.symbol || "").toUpperCase().slice(0, 15),
    name: String(row?.name || "Crypto").slice(0, 80),
    image: null,
    rank: finiteNumber(row?.rank),
    currentPrice: finiteNumber(quote.price),
    marketCap: finiteNumber(quote.market_cap),
    volume24h: finiteNumber(quote.volume_24h),
    high24h: null,
    low24h: null,
    change1h: finiteNumber(quote.percent_change_1h),
    change24h: finiteNumber(quote.percent_change_24h),
    change7d: finiteNumber(quote.percent_change_7d),
    ath: finiteNumber(quote.ath_price),
    athChange: finiteNumber(quote.percent_from_price_ath),
    circulatingSupply: finiteNumber(row?.circulating_supply),
    totalSupply: finiteNumber(row?.total_supply),
    sparkline: []
  };
}

function normalizeCoinGeckoGlobal(row, currency) {
  const data = row?.data || {};
  return {
    totalMarketCap: finiteNumber(data?.total_market_cap?.[currency]),
    totalVolume: finiteNumber(data?.total_volume?.[currency]),
    btcDominance: finiteNumber(data?.market_cap_percentage?.btc),
    ethDominance: finiteNumber(data?.market_cap_percentage?.eth),
    activeCryptocurrencies: finiteNumber(data?.active_cryptocurrencies),
    markets: finiteNumber(data?.markets),
    marketCapChange24h: finiteNumber(data?.market_cap_change_percentage_24h_usd)
  };
}

function normalizeCoinPaprikaGlobal(row, currency, coins) {
  let ratio = 1;
  if (currency === "idr") {
    const first = (Array.isArray(coins) ? coins : []).find((coin) => coin?.quotes?.IDR?.price && coin?.quotes?.USD?.price);
    ratio = first ? Number(first.quotes.IDR.price) / Number(first.quotes.USD.price) : 1;
  }
  const marketCap = finiteNumber(row?.market_cap_usd);
  const volume = finiteNumber(row?.volume_24h_usd);
  return {
    totalMarketCap: marketCap === null ? null : marketCap * ratio,
    totalVolume: volume === null ? null : volume * ratio,
    btcDominance: finiteNumber(row?.bitcoin_dominance_percentage),
    ethDominance: null,
    activeCryptocurrencies: finiteNumber(row?.cryptocurrencies_number),
    markets: finiteNumber(row?.market_number),
    marketCapChange24h: finiteNumber(row?.market_cap_change_24h)
  };
}

function spotlightFromCoins(coins) {
  return [...coins]
    .filter((coin) => coin.change24h !== null)
    .sort((left, right) => Math.abs(right.change24h) - Math.abs(left.change24h))
    .slice(0, 5)
    .map((coin) => ({ id: coin.id, symbol: coin.symbol, name: coin.name, image: coin.image, change24h: coin.change24h }));
}

function normalizeTrending(row, coins) {
  const byId = new Map(coins.map((coin) => [coin.id, coin]));
  const result = (Array.isArray(row?.coins) ? row.coins : []).slice(0, 5).map((entry) => {
    const item = entry?.item || {};
    const market = byId.get(item.id);
    return {
      id: String(item.id || "").slice(0, 80),
      symbol: String(item.symbol || "").toUpperCase().slice(0, 15),
      name: String(item.name || "Crypto").slice(0, 80),
      image: safeImage(item.small || item.thumb),
      change24h: market?.change24h ?? finiteNumber(item?.data?.price_change_percentage_24h?.usd)
    };
  }).filter((item) => item.id);
  return result.length ? result : spotlightFromCoins(coins);
}

async function fetchJson(url, options = {}) {
  const timeoutMs = positiveInteger(process.env.CRYPTO_MARKET_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 15_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "All-Tools-Nexora-Crypto/6.3.17",
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const error = new Error(`UPSTREAM_HTTP_${response.status}`);
      error.code = `UPSTREAM_HTTP_${response.status}`;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("UPSTREAM_TIMEOUT");
      timeoutError.code = "UPSTREAM_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readCoinGecko(currency, limit, apiKey) {
  const headers = { "x-cg-demo-api-key": apiKey };
  const marketUrl = new URL("https://api.coingecko.com/api/v3/coins/markets");
  marketUrl.searchParams.set("vs_currency", currency);
  marketUrl.searchParams.set("order", "market_cap_desc");
  marketUrl.searchParams.set("per_page", String(limit));
  marketUrl.searchParams.set("page", "1");
  marketUrl.searchParams.set("sparkline", "true");
  marketUrl.searchParams.set("price_change_percentage", "1h,24h,7d");
  marketUrl.searchParams.set("locale", "id");
  marketUrl.searchParams.set("precision", "full");

  const [markets, globalResult, trendingResult] = await Promise.all([
    fetchJson(marketUrl, { headers }),
    fetchJson("https://api.coingecko.com/api/v3/global", { headers }).catch(() => null),
    fetchJson("https://api.coingecko.com/api/v3/search/trending", { headers }).catch(() => null)
  ]);
  if (!Array.isArray(markets) || !markets.length) throw Object.assign(new Error("UPSTREAM_EMPTY"), { code: "UPSTREAM_EMPTY" });
  const coins = markets.map(normalizeCoinGeckoCoin).filter((coin) => coin.id && coin.currentPrice !== null);
  return {
    ok: true,
    currency,
    source: "coingecko",
    keyConfigured: true,
    warning: null,
    updatedAt: new Date().toISOString(),
    global: normalizeCoinGeckoGlobal(globalResult, currency),
    spotlight: normalizeTrending(trendingResult, coins),
    coins
  };
}

async function readCoinPaprika(currency, limit, warning) {
  const [tickers, globalResult] = await Promise.all([
    fetchJson("https://api.coinpaprika.com/v1/tickers?quotes=USD,IDR"),
    fetchJson("https://api.coinpaprika.com/v1/global").catch(() => null)
  ]);
  if (!Array.isArray(tickers) || !tickers.length) throw Object.assign(new Error("UPSTREAM_EMPTY"), { code: "UPSTREAM_EMPTY" });
  const hasCurrency = tickers.some((row) => row?.quotes?.[currency.toUpperCase()]);
  const effectiveCurrency = hasCurrency ? currency : "usd";
  const rows = tickers
    .filter((row) => Number(row?.rank) > 0)
    .sort((left, right) => Number(left.rank) - Number(right.rank))
    .slice(0, limit);
  const coins = rows.map((row) => normalizeCoinPaprikaCoin(row, effectiveCurrency)).filter((coin) => coin.id && coin.currentPrice !== null);
  return {
    ok: true,
    currency: effectiveCurrency,
    source: "coinpaprika-fallback",
    keyConfigured: Boolean(String(process.env.COINGECKO_API_KEY || "").trim()),
    warning,
    updatedAt: new Date().toISOString(),
    global: normalizeCoinPaprikaGlobal(globalResult, effectiveCurrency, tickers),
    spotlight: spotlightFromCoins(coins),
    coins
  };
}

async function loadMarket(currency, limit) {
  const apiKey = String(process.env.COINGECKO_API_KEY || "").trim();
  if (apiKey) {
    try {
      return await readCoinGecko(currency, limit, apiKey);
    } catch (error) {
      return readCoinPaprika(currency, limit, `CoinGecko sedang tidak tersedia (${String(error?.code || "UPSTREAM_FAILED").slice(0, 40)}). Data dialihkan ke CoinPaprika.`);
    }
  }
  return readCoinPaprika(currency, limit, "COINGECKO_API_KEY belum dipasang. Data sementara memakai CoinPaprika.");
}

function clientIp(request) {
  return String(request.headers?.["x-forwarded-for"] || request.headers?.["x-real-ip"] || request.socket?.remoteAddress || "unknown")
    .split(",")[0].trim().slice(0, 80);
}

function checkRateLimit(request) {
  return takeFixedWindow(visitors, clientIp(request), {
    windowMs: RATE_WINDOW_MS,
    limit: RATE_LIMIT,
    maxEntries: 2_000
  });
}

function send(response, status, payload, headOnly = false) {
  response.setHeader("Cache-Control", status === 200 ? "public, max-age=15, s-maxage=60, stale-while-revalidate=300" : "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status);
  return headOnly ? response.end() : response.json(payload);
}

async function handleCryptoMarket(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return send(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }
  const rate = checkRateLimit(request);
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    return send(response, 429, { ok: false, error: "RATE_LIMITED", retryAfter: rate.retryAfter }, request.method === "HEAD");
  }

  const requestedCurrency = String(url.searchParams.get("currency") || "idr").toLowerCase();
  if (!ALLOWED_CURRENCIES.has(requestedCurrency)) {
    return send(response, 400, { ok: false, error: "INVALID_CURRENCY", allowed: [...ALLOWED_CURRENCIES] }, request.method === "HEAD");
  }
  const requestedLimit = Number(url.searchParams.get("limit") || 25);
  if (!ALLOWED_LIMITS.has(requestedLimit)) {
    return send(response, 400, { ok: false, error: "INVALID_LIMIT", allowed: [...ALLOWED_LIMITS] }, request.method === "HEAD");
  }

  const cacheKey = `${requestedCurrency}:${requestedLimit}`;
  const cacheMs = positiveInteger(process.env.CRYPTO_MARKET_CACHE_MS, DEFAULT_CACHE_MS, 300_000);
  const cached = responseCache.get(cacheKey);
  const age = cached ? Date.now() - cached.savedAt : Infinity;
  if (cached && age < cacheMs) {
    return send(response, 200, { ...cached.payload, cache: { hit: true, stale: false, ttlMs: cacheMs } }, request.method === "HEAD");
  }

  try {
    if (!inFlight.has(cacheKey)) {
      assertCapacity(inFlight, 32, "CRYPTO_SERVER_BUSY");
      inFlight.set(cacheKey, loadMarket(requestedCurrency, requestedLimit).finally(() => inFlight.delete(cacheKey)));
    }
    const payload = await inFlight.get(cacheKey);
    const savedAt = Date.now();
    setBounded(responseCache, cacheKey, { payload, savedAt }, {
      maxEntries: 128,
      now: savedAt,
      isExpired: (entry) => savedAt - entry.savedAt >= STALE_CACHE_MS
    });
    return send(response, 200, { ...payload, cache: { hit: false, stale: false, ttlMs: cacheMs } }, request.method === "HEAD");
  } catch (error) {
    if (cached && age < STALE_CACHE_MS) {
      return send(response, 200, {
        ...cached.payload,
        warning: "Provider market sedang bermasalah. Menampilkan cache terakhir yang masih aman.",
        cache: { hit: true, stale: true, ttlMs: cacheMs }
      }, request.method === "HEAD");
    }
    console.error("[crypto-market]", error?.code || "UPSTREAM_FAILED");
    return send(response, 503, {
      ok: false,
      error: "MARKET_DATA_UNAVAILABLE",
      message: "Data pasar crypto sedang tidak dapat diambil. Coba lagi beberapa saat."
    }, request.method === "HEAD");
  }
}

function resetCryptoMarketState() {
  responseCache.clear();
  inFlight.clear();
  visitors.clear();
}

module.exports = {
  handleCryptoMarket,
  normalizeCoinGeckoCoin,
  normalizeCoinPaprikaCoin,
  normalizeCoinGeckoGlobal,
  normalizeCoinPaprikaGlobal,
  resetCryptoMarketState
};
