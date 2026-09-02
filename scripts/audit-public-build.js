"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "public");

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function auditPublicBuild(directory = output) {
  const files = walk(directory);
  const failures = [];
  const relative = (file) => path.relative(directory, file).replace(/\\/g, "/");
  const forbiddenNames = /(^|\/)(?:\.env(?:\..*)?|package(?:-lock)?\.json|vercel\.json|database|lib|api|scripts)(?:\/|$)/i;
  const secretPatterns = [
    /AIza[0-9A-Za-z_-]{30,}/g,
    /\bhf_[0-9A-Za-z]{24,}/g,
    /gh[opusr]_[0-9A-Za-z]{30,}/g,
    /\bsk-(?:live|test|proj)-[0-9A-Za-z_-]{20,}/g,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
    /(?:xi-api-key|authorization|x-api-key)\s*["']?\s*[:=]\s*["'](?:Bearer\s+)?[0-9A-Za-z._:-]{16,}["']/gi,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
  ];

  for (const file of files) {
    const name = relative(file);
    if (forbiddenNames.test(name)) failures.push(`file privat ikut terbit: ${name}`);
    if (/\.map$/i.test(name)) failures.push(`source map production ditemukan: ${name}`);
    if (!/\.(?:js|mjs|css|html|json|txt|svg)$/i.test(name)) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(source)) failures.push(`kemungkinan secret pada ${name}`);
    }
  }

  if (failures.length) {
    const error = new Error(`Audit bundle publik gagal:\n- ${[...new Set(failures)].join("\n- ")}`);
    error.code = "PUBLIC_BUILD_SECURITY_FAILED";
    throw error;
  }
  return { files: files.length };
}

if (require.main === module) {
  try {
    const result = auditPublicBuild();
    console.log(`Audit bundle publik lulus: ${result.files} file, tanpa secret dan source map production.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { auditPublicBuild };
