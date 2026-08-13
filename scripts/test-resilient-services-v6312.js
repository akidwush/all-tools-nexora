const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
assert.equal(pkg.version, "6.3.18");

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

assert.equal(fs.existsSync(path.join(root, "assets/js/features/nexus-ai.js")), false, "Modul Nexus AI mati harus dibuang");
assert.equal(fs.existsSync(path.join(root, "assets/js/features/pix-vault.js")), false, "Modul Pix Vault dengan key lama harus dibuang");

console.log(
  "Regression layanan lulus: Fake Bank/FakeDev fallback aktif dan modul mati berisiko sudah dibuang."
);
