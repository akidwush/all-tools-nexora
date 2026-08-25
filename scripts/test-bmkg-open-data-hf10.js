"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const feature = read("assets/js/features/bmkg-open-data.js");
const css = read("assets/css/features/bmkg-open-data.css");
const app = read("assets/js/core/app.js");
const shell = read("assets/js/core/shell.js");
const registry = read("assets/js/core/tool-registry.js");
const lazy = read("assets/js/core/lazy-loader.js");
const api = read("api/tool-health.js");
const health = read("lib/tool-health.js");
const publicDb = read("lib/public-database.js");
const schema = read("database/schema.sql");
const migration = read("database/migrations/020_bmkg_open_data.sql");
const modules = JSON.parse(read("assets/module-manifest.json"));
const routes = JSON.parse(read("route-manifest.json"));
const vercel = JSON.parse(read("vercel.json"));
const local = read("serve-local.js");

assert.match(feature, /window\.renderBmkgIndonesia\s*=/);
assert.match(feature, /\/api\/bmkg/);
assert.match(feature, /Sumber: BMKG/);
assert.match(feature, /NO API KEY/);
assert.ok(css.includes(".nbmkg-hero"));
assert.ok(css.includes("@media (max-width:680px)"));
assert.ok(css.includes("overflow-wrap:anywhere"), "Teks feed BMKG panjang harus tetap berada di dalam kartu.");
assert.ok(css.includes(".nbmkg-weather-metrics{grid-template-columns:1fr"), "Metrik cuaca mobile harus menjadi satu kolom agar terbaca.");
assert.ok(css.includes(".nbmkg-tabs{position:sticky"), "Navigasi tab BMKG harus tetap mudah dijangkau di mobile.");
assert.ok(app.includes("id: 'bmkg'"));
assert.ok(app.includes("case 'bmkg': renderBmkgIndonesia(body); break;"));
assert.ok(shell.includes("bmkg:{renderer:'renderBmkgIndonesia'"));
assert.ok(registry.includes('["bmkg","BMKG Indonesia"'));
assert.ok(lazy.includes("'bmkg-open-data':"));
assert.ok(lazy.includes("bmkg:'bmkg-open-data'"));
assert.equal(modules.tools.bmkg, "bmkg-open-data");
assert.deepEqual(modules.modules["bmkg-open-data"].js, ["assets/js/features/bmkg-open-data.js"]);
assert.deepEqual(modules.modules["bmkg-open-data"].css, ["assets/css/features/bmkg-open-data.css"]);
assert.ok(routes.apiRoutes.includes("/api/bmkg"));
assert.ok(vercel.rewrites.some((row) => row.source === "/api/bmkg" && /mode=bmkg-open-data/.test(row.destination)));
assert.ok(local.includes('"/api/bmkg": { file: "api/tool-health.js", mode: "bmkg-open-data" }'));
assert.match(api, /handleBmkgOpenData/);
assert.match(health, /id: "bmkg"/);
assert.match(publicDb, /bmkg:\s*\{/);
assert.match(schema, /\('bmkg', 'BMKG Indonesia'/);
assert.match(migration, /'bmkg'/);
assert.ok(!/BMKG_(?:API_)?KEY/.test(read(".env.example")), "BMKG Open Data tidak boleh meminta API key");

const lib = require(path.join(root, "lib/bmkg-open-data.js"));
assert.equal(lib.validAdm4("31.71.03.1001"), "31.71.03.1001");
assert.equal(lib.validAdm4("3171031001"), "");
assert.equal(lib.validAdm4("31.71.03.abc1"), "");
assert.deepEqual(lib.normalizeQuake({
  Tanggal: "16 Agu 2026", Jam: "11:30:52 WIB", DateTime: "2026-08-16T04:30:52+00:00",
  Coordinates: "-8.62,120.48", Lintang: "8.62 LS", Bujur: "120.48 BT", Magnitude: "3.3",
  Kedalaman: "4 km", Wilayah: "Ruteng", Potensi: "Tidak berpotensi tsunami", Dirasakan: "III-IV Ruteng",
  Shakemap: "20260816113052.mmi.jpg"
}), {
  date: "16 Agu 2026", time: "11:30:52 WIB", dateTime: "2026-08-16T04:30:52+00:00",
  coordinates: "-8.62,120.48", latitude: "8.62 LS", longitude: "120.48 BT", lat: -8.62, lon: 120.48,
  magnitude: 3.3, depth: "4 km", region: "Ruteng", potential: "Tidak berpotensi tsunami", felt: "III-IV Ruteng",
  shakemap: "https://static.bmkg.go.id/20260816113052.mmi.jpg"
});

const weather = lib.normalizeWeather({
  lokasi: { adm4: "31.71.03.1001", provinsi: "DKI Jakarta", kotkab: "Kota Adm. Jakarta Pusat", kecamatan: "Kemayoran", desa: "Kemayoran", lon: 106.84, lat: -6.16, timezone: "+0700" },
  data: [{ cuaca: [[{ local_datetime: "2026-08-16 15:00:00", utc_datetime: "2026-08-16 08:00:00", t: 31, hu: 72, weather_desc: "Berawan", ws: 10, wd: "E", tcc: 70, vs_text: "> 10 km", tp: 0 }]] }]
});
assert.equal(weather.location.village, "Kemayoran");
assert.equal(weather.forecasts.length, 1);
assert.equal(weather.forecasts[0].temperatureC, 31);
assert.equal(weather.forecasts[0].weather, "Berawan");

const alerts = lib.normalizeAlerts('<?xml version="1.0"?><rss><channel><title>Peringatan Dini Cuaca</title><lastBuildDate>Sun, 16 Aug 2026 06:00:00 GMT</lastBuildDate><item><title><![CDATA[Peringatan Dini Jawa Barat]]></title><link>https://www.bmkg.go.id/alerts/nowcast/id/ABC_alert.xml</link><description><![CDATA[Hujan sedang-lebat.]]></description><author>BMKG</author><pubDate>Sun, 16 Aug 2026 13:00:00 +0700</pubDate></item></channel></rss>');
assert.equal(alerts.alerts.length, 1);
assert.equal(alerts.alerts[0].title, "Peringatan Dini Jawa Barat");
assert.equal(alerts.alerts[0].description, "Hujan sedang-lebat.");

function mockResponse(){
  return {
    statusCode: 0, payload: null, headers: {}, ended: false,
    setHeader(k,v){this.headers[k]=v;},
    status(code){this.statusCode=code;return this;},
    json(payload){this.payload=payload;return this;},
    end(){this.ended=true;return this;}
  };
}
function upstreamJson(payload,status=200){
  return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(payload)};
}
function upstreamText(payload,status=200){
  return {ok:status>=200&&status<300,status,text:async()=>payload};
}

const originalFetch = global.fetch;
const calls = [];
global.fetch = async (url) => {
  calls.push(String(url));
  if(String(url).includes("autogempa.json")) return upstreamJson({Infogempa:{gempa:{Tanggal:"16 Agu 2026",Jam:"11:30:52 WIB",DateTime:"2026-08-16T04:30:52+00:00",Coordinates:"-8.62,120.48",Lintang:"8.62 LS",Bujur:"120.48 BT",Magnitude:"3.3",Kedalaman:"4 km",Wilayah:"Ruteng",Potensi:"Tidak berpotensi tsunami",Dirasakan:"III-IV Ruteng"}}});
  if(String(url).includes("prakiraan-cuaca")) return upstreamJson({lokasi:{adm4:"31.71.03.1001",provinsi:"DKI Jakarta",kotkab:"Jakarta Pusat",kecamatan:"Kemayoran",desa:"Kemayoran"},data:[{cuaca:[[{local_datetime:"2026-08-16 15:00:00",t:31,hu:72,weather_desc:"Berawan",ws:10,wd:"E",vs_text:"> 10 km"}]]}]});
  if(String(url).includes("alerts/nowcast/id")) return upstreamText('<rss><channel><title>Peringatan</title><item><title>Alert Jakarta</title><link>https://www.bmkg.go.id/alerts/nowcast/id/X_alert.xml</link><description>Hujan lebat</description><pubDate>Sun, 16 Aug 2026 13:00:00 +0700</pubDate></item></channel></rss>');
  throw new Error("Unexpected URL "+url);
};

(async()=>{
  try{
    const healthResponse=mockResponse();
    await lib.handleBmkgOpenData({method:"GET",headers:{}},healthResponse,new URL("https://nexora.test/api/bmkg?health=1"));
    assert.equal(healthResponse.statusCode,200);
    assert.equal(healthResponse.payload.apiKeyRequired,false);

    const quakeResponse=mockResponse();
    await lib.handleBmkgOpenData({method:"GET",headers:{}},quakeResponse,new URL("https://nexora.test/api/bmkg?section=latest"));
    assert.equal(quakeResponse.statusCode,200);
    assert.equal(quakeResponse.payload.quakes[0].magnitude,3.3);
    assert.equal(quakeResponse.payload.meta.attribution,"Sumber: BMKG");

    const weatherResponse=mockResponse();
    await lib.handleBmkgOpenData({method:"GET",headers:{}},weatherResponse,new URL("https://nexora.test/api/bmkg?section=weather&adm4=31.71.03.1001"));
    assert.equal(weatherResponse.statusCode,200);
    assert.equal(weatherResponse.payload.location.village,"Kemayoran");

    const invalidWeather=mockResponse();
    await lib.handleBmkgOpenData({method:"GET",headers:{}},invalidWeather,new URL("https://nexora.test/api/bmkg?section=weather&adm4=hello"));
    assert.equal(invalidWeather.statusCode,400);
    assert.equal(invalidWeather.payload.error,"INVALID_ADM4");

    const alertResponse=mockResponse();
    await lib.handleBmkgOpenData({method:"GET",headers:{}},alertResponse,new URL("https://nexora.test/api/bmkg?section=alerts"));
    assert.equal(alertResponse.statusCode,200);
    assert.equal(alertResponse.payload.alerts.length,1);
    assert.ok(calls.some((url)=>url.includes("data.bmkg.go.id")));
    assert.ok(calls.some((url)=>url.includes("api.bmkg.go.id")));
    assert.ok(calls.some((url)=>url.includes("bmkg.go.id/alerts")));

    console.log("BMKG Open Data HF10 regression: OK");
  } finally {
    global.fetch=originalFetch;
  }
})().catch((error)=>{global.fetch=originalFetch;console.error(error);process.exit(1);});
