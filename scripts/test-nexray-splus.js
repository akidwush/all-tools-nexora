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
    headers: { get(name) { return String(name).toLowerCase() === "content-length" ? String(Buffer.byteLength(raw)) : "application/json"; } },
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
  assert.equal(suno.title, "Night Drive");

  const veo = await splus.veo3({ prompt: "gentle camera push", imageUrl: "https://cdn.example/input.jpg" }, {
    fetch: async (url) => {
      assert.match(url, /\/ai\/veo3\?/);
      assert.match(url, /image_url=https%3A%2F%2Fcdn\.example%2Finput\.jpg/);
      return jsonResponse(200, { result: { video: "https://cdn.example/out.mp4" } });
    }
  });
  assert.equal(veo.videoUrl, "https://cdn.example/out.mp4");

  const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nAAAAABJRU5ErkJggg==";
  let editCalls = 0;
  const edited = await splus.imageEdit({ engine: "auto", param: "make it cinematic", imageData: onePixelPng }, {
    fetch: async (url) => {
      editCalls += 1;
      if (String(url).includes("/ai/nanobanana")) return jsonResponse(500, { success: false, message: "provider busy" });
      assert.match(String(url), /\/ai\/gptimage$/);
      return jsonResponse(200, { data: { image_url: "https://cdn.example/edited.webp" } });
    }
  });
  assert.equal(editCalls, 2);
  assert.equal(edited.engine, "gptimage");
  assert.equal(edited.imageUrl, "https://cdn.example/edited.webp");

  const request = { method: "POST", body: {}, headers: {} };
  assert.deepEqual(policy.toolHealthToolIds("nexray-splus", request, new URL("https://nexora.test/api/tool-health?mode=nexray-splus&action=suno")), ["aisong"]);
  assert.deepEqual(policy.toolHealthToolIds("nexray-splus", request, new URL("https://nexora.test/api/tool-health?mode=nexray-splus&action=veo3")), ["aivideo"]);
  assert.deepEqual(policy.toolHealthToolIds("nexray-splus", request, new URL("https://nexora.test/api/tool-health?mode=nexray-splus&action=image-edit")), ["aiimage"]);
  assert.equal(policy.isServerAuthorizedTool("aiimage"), true);
  assert.equal(policy.isServerAuthorizedTool("aivideo"), true);

  const loader = fs.readFileSync(path.join(root, "assets/js/core/lazy-loader.js"), "utf8");
  for (const token of ["puter-image", "puter-video", "ai-song", "assets/css/features/nexray-splus.css", "assets/js/features/nexray-splus-hooks.js"]) assert.match(loader, new RegExp(token));
  const hook = fs.readFileSync(path.join(root, "assets/js/features/nexray-splus-hooks.js"), "utf8");
  for (const token of ["renderPuterImage", "renderPuterVideo", "renderAiSong", "image-edit", "veo3", "suno"]) assert.match(hook, new RegExp(token));
  const api = fs.readFileSync(path.join(root, "api/tool-health.js"), "utf8");
  assert.match(api, /handleNexraySPlus/);

  console.log("Nexora Nexray S+ tests lulus: Suno, Veo3, Nano Banana→GPT Image fallback, server auth, dan lazy hooks tervalidasi.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
