const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const functions = walk(path.join(root, "api"))
  .filter((file) => file.endsWith(".js"))
  .map((file) => path.relative(root, file))
  .sort();

assert.equal(functions.length <= 12, true, `Vercel Hobby limit terlewati: ${functions.length} functions`);
assert.equal(fs.existsSync(path.join(root, "api/analytics.js")), false);
assert.equal(fs.existsSync(path.join(root, "api/database.js")), false);
assert.equal(fs.existsSync(path.join(root, "lib/public-analytics.js")), true);
assert.equal(fs.existsSync(path.join(root, "lib/public-database.js")), true);

const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
for (const source of ["/api/analytics", "/api/database"]) {
  assert.equal(vercel.rewrites.some((rewrite) => rewrite.source === source), true, `${source} rewrite harus tersedia`);
}

console.log(`Serverless limit test lulus: ${functions.length}/12 functions (${functions.join(", ")}).`);
