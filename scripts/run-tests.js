"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
require("./sync-config.js").syncConfig({ silent: true });
const scripts = fs.readdirSync(__dirname)
  .filter((name) => /^test-.*\.js$/i.test(name))
  .sort((left, right) => left.localeCompare(right));

if (!scripts.length) {
  console.error("Tidak ada regression test yang ditemukan.");
  process.exit(1);
}

const failures = [];
for (const script of scripts) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test" }
  });
  if (result.status !== 0) failures.push(script);
}

if (failures.length) {
  console.error(`Regression test gagal (${failures.length}/${scripts.length}): ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`Regression test lulus: ${scripts.length}/${scripts.length}.`);
