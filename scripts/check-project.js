const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const htmlFiles = ["index.html", "about.html", "feedback.html"];
let failed = false;

for (const filename of htmlFiles) {
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  if (!/<\/html>\s*$/i.test(source)) {
    console.error(`${filename}: penutup HTML tidak valid.`);
    failed = true;
  }

  let scriptIndex = 0;
  for (const match of source.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    scriptIndex += 1;
    if (/\bsrc\s*=/.test(match[1])) continue;
    try {
      new vm.Script(match[2], { filename: `${filename}:inline-${scriptIndex}` });
    } catch (error) {
      console.error(`${filename}: ${error.message}`);
      failed = true;
    }
  }
}

for (const filename of ["api/health.js", "api/feedback.js", "api/database.js", "lib/database.js", "serve-local.js"]) {
  try {
    new vm.Script(fs.readFileSync(path.join(root, filename), "utf8"), { filename });
  } catch (error) {
    console.error(`${filename}: ${error.message}`);
    failed = true;
  }
}

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const requiredToken of ["nxgcReport", "analyzeExtractedSource", "downloadSourceReport"]) {
  if (!index.includes(requiredToken)) {
    console.error(`index.html belum berisi fitur laporan Get Code: ${requiredToken}`);
    failed = true;
  }
}
const forbidden = ["arguments.callee", "api.telegram.org/bot", "REPORT_FEEDBACK_B64", "ABOUT_DEV_B64"];
for (const token of forbidden) {
  if (index.includes(token)) {
    console.error(`index.html masih berisi pola terlarang: ${token}`);
    failed = true;
  }
}

// Kredensial lama pernah disembunyikan sebagai HTML base64. Audit seluruh string base64 panjang.
for (const match of index.matchAll(/["']([A-Za-z0-9+/]{160,}={0,2})["']/g)) {
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    if (/api\.telegram\.org\/bot|\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/i.test(decoded)) {
      console.error("index.html masih memuat kredensial layanan pesan di dalam payload base64.");
      failed = true;
      break;
    }
  } catch {}
}

if (failed) process.exit(1);
console.log("Audit statis lulus: sintaks valid dan pola fatal/rahasia telah dibuang.");
