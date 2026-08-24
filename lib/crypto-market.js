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
const analysisCache = new Map();
const ANALYSIS_CACHE_MS = 30_000;

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

function average(values) {
  const rows = values.filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let current = average(values.slice(0, period));
  for (const value of values.slice(period)) current = (value - current) * multiplier + current;
  return current;
}

function emaSeries(values, period) {
  if (!Array.isArray(values) || values.length < period) return [];
  const output = Array(period - 1).fill(null);
  const multiplier = 2 / (period + 1);
  let current = average(values.slice(0, period));
  output.push(current);
  for (const value of values.slice(period)) {
    current = (value - current) * multiplier + current;
    output.push(current);
  }
  return output;
}

function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return null;
  let gains = 0, losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(0, change); losses += Math.max(0, -change);
  }
  let averageGain = gains / period, averageLoss = losses / period;
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = ((averageGain * (period - 1)) + Math.max(0, change)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(0, -change)) / period;
  }
  if (averageLoss === 0) return 100;
  return 100 - (100 / (1 + averageGain / averageLoss));
}

function atr(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length <= period) return null;
  const ranges = candles.slice(1).map((candle, index) => Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - candles[index].close),
    Math.abs(candle.low - candles[index].close)
  ));
  let current = average(ranges.slice(0, period));
  for (const value of ranges.slice(period)) current = ((current * (period - 1)) + value) / period;
  return current;
}

function macd(values) {
  const fast = emaSeries(values, 12), slow = emaSeries(values, 26);
  const line = values.map((_, index) => Number.isFinite(fast[index]) && Number.isFinite(slow[index]) ? fast[index] - slow[index] : null);
  const valid = line.filter(Number.isFinite);
  if (valid.length < 9) return { line: null, signal: null, histogram: null };
  const signal = ema(valid, 9), latest = valid[valid.length - 1];
  return { line: latest, signal, histogram: latest - signal };
}

function normalizeBinanceCandles(rows) {
  const now = Date.now();
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    openTime: finiteNumber(row?.[0]), open: finiteNumber(row?.[1]), high: finiteNumber(row?.[2]), low: finiteNumber(row?.[3]), close: finiteNumber(row?.[4]), volume: finiteNumber(row?.[5]), closeTime: finiteNumber(row?.[6])
  })).filter((row) => Object.values(row).every((value) => value !== null)).filter((row) => row.closeTime <= now);
}

function percentChange(from, to) {
  return Number.isFinite(from) && from !== 0 && Number.isFinite(to) ? ((to - from) / from) * 100 : null;
}

function analyzeTimeframe(candles, label, intervalMs) {
  if (!Array.isArray(candles) || candles.length < 55) throw Object.assign(new Error("CANDLE_DATA_INSUFFICIENT"), { code: "CANDLE_DATA_INSUFFICIENT" });
  const closes = candles.map((item) => item.close), latest = candles[candles.length - 1];
  const ema9 = ema(closes, 9), ema21 = ema(closes, 21), ema50 = ema(closes, 50), rsi14 = rsi(closes), atr14 = atr(candles), macdValue = macd(closes);
  const recent = candles.slice(-48), support = Math.min(...recent.map((item) => item.low)), resistance = Math.max(...recent.map((item) => item.high));
  const previousVolumes = candles.slice(-21, -1).map((item) => item.volume), volumeAverage = average(previousVolumes);
  const volumeRatio = volumeAverage ? latest.volume / volumeAverage : null;
  let score = 0;
  if (latest.close > ema21) score += 1; else score -= 1;
  if (ema9 > ema21) score += 1; else score -= 1;
  if (ema21 > ema50) score += 1; else score -= 1;
  if (rsi14 >= 52 && rsi14 <= 70) score += 1; else if (rsi14 <= 48 && rsi14 >= 30) score -= 1;
  if (macdValue.histogram > 0) score += 1; else score -= 1;
  const bias = score >= 3 ? "bullish" : score <= -3 ? "bearish" : "neutral";
  const flags = [];
  if (rsi14 >= 70) flags.push("RSI overbought");
  if (rsi14 <= 30) flags.push("RSI oversold");
  if (volumeRatio !== null && volumeRatio < 0.7) flags.push("Volume di bawah rata-rata");
  if (volumeRatio !== null && volumeRatio > 1.5) flags.push("Volume meningkat");
  return {
    label, bias, score, confluence: Math.round(Math.abs(score) / 5 * 100), close: latest.close,
    change: percentChange(closes[Math.max(0, closes.length - 5)], latest.close),
    ema9, ema21, ema50, rsi14, macd: macdValue, atr: atr14, atrPercent: atr14 / latest.close * 100,
    volumeRatio, support, resistance, flags, candles: candles.length,
    closedAt: new Date(latest.closeTime).toISOString(), stale: nowStale(latest.closeTime, intervalMs)
  };
}

function nowStale(timestamp, intervalMs) {
  return !Number.isFinite(timestamp) || Date.now() - timestamp > intervalMs * 3;
}

function combinedBias(parts) {
  const score = parts.reduce((sum, item) => sum + item.score, 0);
  const maximum = parts.length * 5;
  const directionalThreshold = parts.length * 3;
  return { bias: score >= directionalThreshold ? "bullish" : score <= -directionalThreshold ? "bearish" : "neutral", score, confluence: Math.round(Math.abs(score) / maximum * 100), aligned: parts.every((item) => item.bias === parts[0].bias) && parts[0].bias !== "neutral" };
}

function riskReferences(oneHour, daily) {
  const current = oneHour.close, volatility = oneHour.atr || current * 0.01;
  const bullishInvalidation = Math.max(oneHour.support, current - volatility * 1.5);
  const bearishInvalidation = Math.min(oneHour.resistance, current + volatility * 1.5);
  return {
    volatility: oneHour.atrPercent < 1 ? "rendah" : oneHour.atrPercent < 2.5 ? "sedang" : "tinggi",
    bullishInvalidation, bearishInvalidation,
    upsideReference: Math.max(oneHour.resistance, current + volatility * 2),
    downsideReference: Math.min(oneHour.support, current - volatility * 2),
    macroSupport: daily.support, macroResistance: daily.resistance
  };
}

async function loadBinanceAnalysis(symbol) {
  const pair = `${symbol}USDT`;
  const endpoint = "https://data-api.binance.vision/api/v3/klines";
  const getCandles = (interval, limit) => fetchJson(`${endpoint}?symbol=${encodeURIComponent(pair)}&interval=${interval}&limit=${limit}`);
  const [m15, h1, d1] = await Promise.all([getCandles("15m", 200), getCandles("1h", 200), getCandles("1d", 120)]);
  return { pair, provider: "binance-spot", quality: "exchange-ohlcv", m15: normalizeBinanceCandles(m15), h1: normalizeBinanceCandles(h1), d1: normalizeBinanceCandles(d1) };
}

function buildAnalysis(symbol, id, data, global) {
  const m15 = analyzeTimeframe(data.m15, "15 Menit", 15 * 60_000);
  const h1 = analyzeTimeframe(data.h1, "1 Jam", 60 * 60_000);
  const d1 = analyzeTimeframe(data.d1, "Harian", 24 * 60 * 60_000);
  const micro = combinedBias([m15, h1]);
  const macro = combinedBias([d1]);
  const warnings = [...new Set([...m15.flags, ...h1.flags, ...d1.flags])];
  if (!micro.aligned) warnings.unshift("Timeframe 15m dan 1h belum selaras");
  if ([m15, h1, d1].some((item) => item.stale)) warnings.unshift("Sebagian candle terlambat diperbarui");
  return {
    asset: { id, symbol, pair: data.pair }, provider: data.provider, dataQuality: data.quality,
    updatedAt: h1.closedAt, timeframes: { m15, h1, d1 }, micro,
    macro: { ...macro, marketCapChange24h: global?.marketCapChange24h ?? null, btcDominance: global?.btcDominance ?? null },
    risk: riskReferences(h1, d1), warnings,
    methodology: "EMA 9/21/50, RSI 14, MACD 12-26-9, ATR 14, volume relatif 20 candle, serta support/resistance 48 candle tertutup.",
    disclaimer: "Analisis probabilistik berbasis candle tertutup, bukan jaminan hasil atau saran membeli/menjual."
  };
}

async function loadAnalysis(symbol, id) {
  const data = await loadBinanceAnalysis(symbol);
  let global = null;
  try {
    const key = String(process.env.COINGECKO_API_KEY || "").trim();
    const row = await fetchJson("https://api.coingecko.com/api/v3/global", { headers: key ? { "x-cg-demo-api-key": key } : {} });
    global = normalizeCoinGeckoGlobal(row, "usd");
  } catch {}
  return buildAnalysis(symbol, id, data, global);
}

async function handleAnalysis(request, response, url) {
  const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
  const id = String(url.searchParams.get("id") || "").trim().toLowerCase();
  if (!/^[A-Z0-9]{2,12}$/.test(symbol) || !/^[a-z0-9-]{2,80}$/.test(id)) return send(response, 400, { ok: false, error: "INVALID_ASSET", message: "Aset crypto tidak valid." }, request.method === "HEAD");
  const cacheKey = `analysis:${symbol}:${id}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < ANALYSIS_CACHE_MS) return send(response, 200, { ok: true, analysis: cached.payload, cache: { hit: true, ttlMs: ANALYSIS_CACHE_MS } }, request.method === "HEAD");
  try {
    const payload = await loadAnalysis(symbol, id);
    setBounded(analysisCache, cacheKey, { payload, savedAt: Date.now() }, { maxEntries: 128, isExpired: (entry) => Date.now() - entry.savedAt > 5 * 60_000 });
    return send(response, 200, { ok: true, analysis: payload, cache: { hit: false, ttlMs: ANALYSIS_CACHE_MS } }, request.method === "HEAD");
  } catch (error) {
    const unsupported = /^UPSTREAM_HTTP_4/.test(String(error?.code || ""));
    console.error("[crypto-analysis]", unsupported ? "PAIR_NOT_AVAILABLE" : error?.code || "ANALYSIS_FAILED");
    return send(response, unsupported ? 422 : 503, { ok: false, error: unsupported ? "PAIR_NOT_AVAILABLE" : "ANALYSIS_UNAVAILABLE", message: unsupported ? `${symbol}/USDT belum tersedia pada sumber candle utama.` : "Candle multi-timeframe belum dapat dianalisis. Coba lagi sesaat." }, request.method === "HEAD");
  }
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
        "User-Agent": "All-Tools-Nexora-Crypto/6.3.18",
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
  if (url.searchParams.get("analysis") === "1") return handleAnalysis(request, response, url);

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
  analysisCache.clear();
}

module.exports = {
  handleCryptoMarket,
  normalizeCoinGeckoCoin,
  normalizeCoinPaprikaCoin,
  normalizeCoinGeckoGlobal,
  normalizeCoinPaprikaGlobal,
  analyzeTimeframe,
  buildAnalysis,
  normalizeBinanceCandles,
  resetCryptoMarketState
};
