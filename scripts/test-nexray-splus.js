"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const splus = require(path.join(root, "lib/nexray-splus"));
const policy = require(path.join(root, "lib/server-access-policy"));

function jsonResponse(status, payload) {
  const raw = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) {
      const key=String(name).toLowerCase();
      if(key==="content-length") return String(Buffer.byteLength(raw));
      if(key==="content-type") return "application/json";
      return "";
    }},
    async text() { return raw; },
    async arrayBuffer() { return Buffer.from(raw); }
  };
}

(async () => {
  const suno = await splus.suno({ prompt: "lofi city pop" }, {
    fetch: async (url) => {
      assert.match(url, /\/ai\/suno\?prompt=lofi\+city\+pop/);
      return jsonResponse(200, { success: true, data: { audio_url: "https://cdn.example/song.mp3", title: "Night Drive" } });
    }
  });
  assert.equal(suno.audioUrl, "https://cdn.example/song.mp3");

  const veo = await splus.veo3({ prompt: "gentle camera push", imageUrl: "https://cdn.example/input.jpg" }, {
    fetch: async (url) => {
      assert.match(url, /\/ai\/veo3\?/);
      assert.match(url, /image_url=https%3A%2F%2Fcdn\.example%2Finput\.jpg/);
      return jsonResponse(200, { result: { video: "https://cdn.example/out.mp4" } });
    }
  });
  assert.equal(veo.videoUrl, "https://cdn.example/out.mp4");

  const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nAAAAABJRU5ErkJggg==";
  let calls=0;
  const edited = await splus.imageEdit({ engine: "nanobanana", param: "make it cinematic", imageData: onePixelPng }, {
    fetch: async (url, init) => {
      calls++;
      assert.match(String(url), /\/ai\/nanobanana$/);
      assert.equal(init.method, "POST");
      assert.match(String(init.headers["Content-Type"]), /^multipart\/form-data; boundary=/);
      assert.ok(Number(init.headers["Content-Length"]) > 0);
      assert.ok(Buffer.isBuffer(init.body));
      assert.match(init.body.toString("latin1"), /name="image"/);
      assert.match(init.body.toString("latin1"), /name="param"/);
      return jsonResponse(200, { data: { image_url: "https://cdn.example/edited.webp" } });
    }
  });
  assert.equal(calls,1);
  assert.equal(edited.engine,"nanobanana");
  assert.equal(edited.imageUrl,"https://cdn.example/edited.webp");

  await assert.rejects(
    () => splus.imageEdit({ engine:"gptimage", param:"edit", imageData:onePixelPng }, { fetch:async()=>jsonResponse(200,{}) }),
    /dinonaktifkan/
  );

  const request = { method: "POST", body: {}, headers: {} };
  assert.deepEqual(policy.toolHealthToolIds("nexray-splus", request, new URL("https://nexora.test/api/tool-health?mode=nexray-splus&action=suno")), ["aisong"]);
  assert.deepEqual(policy.toolHealthToolIds("nexray-splus", request, new URL("https://nexora.test/api/tool-health?mode=nexray-splus&action=veo3")), ["aivideo"]);
  assert.deepEqual(policy.toolHealthToolIds("nexray-splus", request, new URL("https://nexora.test/api/tool-health?mode=nexray-splus&action=image-edit")), ["aiimage"]);

  const hook = fs.readFileSync(path.join(root, "assets/js/features/nexray-splus-hooks.js"), "utf8");
  assert.match(hook,/Nano Banana — Nexray S\+/);
  assert.doesNotMatch(hook,/GPT Image — Nexray S\+/);
  console.log("Nexora Nexray S+ V3 tests lulus: multipart Nano Banana, GPT S+ disabled, Suno, Veo3, auth hooks tervalidasi.");
})().catch((error) => { console.error(error); process.exit(1); });
