const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
assert.equal(pkg.version, "6.3.12");

const bank = fs.readFileSync(
  path.join(root, "assets/js/features/download-pack.js"),
  "utf8"
);
for (const token of [
  "nxBuildFakeBankJagoLocal",
  "SIMULASI — BUKAN BUKTI SALDO",
  "renderLocal(name,balance,reason)",
  '() => fallback("timeout")',
  "URL.revokeObjectURL(localObjectUrl)"
]) {
  assert.ok(bank.includes(token), `Fake Bank Jago belum memiliki: ${token}`);
}

const fakeDev = fs.readFileSync(
  path.join(root, "assets/js/features/source-features.js"),
  "utf8"
);
assert.ok(fakeDev.includes("Mode lokal aktif. Profile"));
assert.ok(fakeDev.includes('"success"'));

const nexusJs = fs.readFileSync(
  path.join(root, "assets/js/features/nexus-ai.js"),
  "utf8"
);
const match = nexusJs.match(/var AIVA_B64 = "([^"]+)";/);
assert.ok(match, "Payload Nexus AI tidak ditemukan");
const html = Buffer.from(match[1], "base64").toString("utf8");

for (const token of [
  'if(api==="worm")return callWorm(message,history);',
  'if(api==="worm")return callWorm(message,history,signal);',
  "if (api === 'worm') return callWorm(message, history);",
  "if (api === 'worm') return callWorm(message, history, signal);",
  "function nxMultiReplyUnavailable",
  "async function nxResolveMultiReplies",
  "const workerCount=Math.min(2,queue.length)",
  "nxCallAutomaticModelBackup("
]) {
  assert.ok(html.includes(token), `Nexus AI belum memiliki: ${token}`);
}

assert.ok(
  html.includes('if(api!=="worm"&&!isPrimary&&!nxIsAutomaticBackupRun())'),
  "nxPrimaryCall masih menolak Worm sebelum router dijalankan"
);

console.log(
  "Nexora v6.3.12 tests lulus: Fake Bank lokal, Worm Auto routing, dan Multi-model failover aktif."
);
