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

for (const filename of ["api/health.js", "api/feedback.js", "lib/database.js", "serve-local.js"]) {
  try {
    new vm.Script(fs.readFileSync(path.join(root, filename), "utf8"), { filename });
  } catch (error) {
    console.error(`${filename}: ${error.message}`);
    failed = true;
  }
}

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const forbidden = ["arguments.callee", "api.telegram.org/bot", "REPORT_FEEDBACK_B64", "ABOUT_DEV_B64"];
for (const token of forbidden) {
  if (index.includes(token)) {
    console.error(`index.html masih berisi pola terlarang: ${token}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("Audit statis lulus: sintaks valid dan pola fatal/rahasia telah dibuang.");
