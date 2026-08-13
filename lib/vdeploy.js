const crypto = require('node:crypto');
const zlib = require('node:zlib');

// Base64 menambah ukuran sekitar 33%; 3,2 MB tetap di bawah batas body Function 4,5 MB.
const MAX_ARCHIVE_BYTES = 3_200_000;
const MAX_UNCOMPRESSED_BYTES = 14 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 600;

function send(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(payload);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body); } catch {}
  }
  return {};
}

function requireAccess(req) {
  const expected = String(process.env.NEXUS_DEPLOY_ACCESS_KEY || '').trim();
  if (!expected) return { ok: false, status: 503, code: 'deploy_access_not_configured', message: 'Nexus Deploy belum dikonfigurasi di server.' };
  const supplied = String(req.headers['x-deploy-key'] || '').trim();
  if (!supplied || !safeEqual(supplied, expected)) {
    return { ok: false, status: 401, code: 'access_key_required', message: 'Kode akses Nexus Deploy diperlukan.' };
  }
  return { ok: true };
}

function providerConfig(platform) {
  if (platform === 'netlify') {
    return {
      platform,
      configured: Boolean(String(process.env.NETLIFY_TOKEN || '').trim()),
      token: String(process.env.NETLIFY_TOKEN || '').trim()
    };
  }
  return {
    platform: 'vercel',
    configured: Boolean(String(process.env.VERCEL_TOKEN || '').trim()),
    token: String(process.env.VERCEL_TOKEN || '').trim(),
    teamId: String(process.env.VERCEL_TEAM_ID || '').trim()
  };
}

function projectName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function cleanZipPath(raw) {
  const path = String(raw || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!path || path.startsWith('/') || path.includes('\0')) throw new Error('ZIP_PATH_INVALID');
  const parts = path.split('/').filter(Boolean);
  if (!parts.length || parts.some(part => part === '..' || part === '.')) throw new Error('ZIP_PATH_INVALID');
  return parts.join('/');
}

function findEocd(buffer) {
  const start = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= start; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function extractZip(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('ZIP_EMPTY');
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error('ZIP_TOO_LARGE');
  const eocd = findEocd(buffer);
  if (eocd < 0) throw new Error('ZIP_INVALID');
  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (!count || count > MAX_FILES) throw new Error('ZIP_FILE_COUNT_INVALID');
  if (centralOffset + centralSize > buffer.length) throw new Error('ZIP_INVALID');

  const files = [];
  let cursor = centralOffset;
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('ZIP_INVALID');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const rawName = buffer.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8');
    cursor += 46 + nameLen + extraLen + commentLen;
    if (rawName.endsWith('/')) continue;
    const path = cleanZipPath(rawName);
    if (uncompressedSize > MAX_FILE_BYTES) throw new Error('ZIP_FILE_TOO_LARGE');
    total += uncompressedSize;
    if (total > MAX_UNCOMPRESSED_BYTES) throw new Error('ZIP_EXPANDED_TOO_LARGE');
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('ZIP_INVALID');
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error('ZIP_INVALID');
    const compressed = buffer.subarray(dataStart, dataEnd);
    let content;
    if (method === 0) content = Buffer.from(compressed);
    else if (method === 8) content = zlib.inflateRawSync(compressed, { maxOutputLength: Math.min(MAX_FILE_BYTES, uncompressedSize + 1024) });
    else throw new Error('ZIP_COMPRESSION_UNSUPPORTED');
    if (content.length !== uncompressedSize) throw new Error('ZIP_SIZE_MISMATCH');
    files.push({ path, content });
  }
  if (!files.length) throw new Error('ZIP_NO_FILES');
  return files;
}

async function parseApiResponse(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 300) }; }
  if (!response.ok) {
    const message = data?.error?.message || data?.error || data?.message || `HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function vercelUrl(path, teamId) {
  const url = new URL(path, 'https://api.vercel.com');
  if (teamId) url.searchParams.set('teamId', teamId);
  return url.toString();
}

async function uploadVercelFile(file, config) {
  const sha = crypto.createHash('sha1').update(file.content).digest('hex');
  const response = await fetch(vercelUrl('/v2/now/files', config.teamId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'x-vercel-digest': sha,
      'Content-Type': 'application/octet-stream'
    },
    body: file.content
  });
  if (!response.ok && response.status !== 409) await parseApiResponse(response);
  else { try { await response.body?.cancel(); } catch {} }
  return { file: file.path, sha, size: file.content.length };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function createVercel(name, archive, config) {
  const files = extractZip(archive);
  const refs = await mapLimit(files, 4, file => uploadVercelFile(file, config));
  const response = await fetch(vercelUrl('/v13/deployments', config.teamId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      files: refs,
      target: 'production',
      projectSettings: { framework: null }
    })
  });
  const data = await parseApiResponse(response);
  return {
    id: data.id || data.uid,
    readyState: data.readyState || data.state || 'BUILDING',
    state: data.readyState || data.state || 'BUILDING',
    status: data.status,
    url: data.url
  };
}

async function statusVercel(id, config) {
  const response = await fetch(vercelUrl(`/v13/deployments/${encodeURIComponent(id)}`, config.teamId), {
    headers: { Authorization: `Bearer ${config.token}` }
  });
  const data = await parseApiResponse(response);
  return {
    id: data.id || data.uid || id,
    readyState: data.readyState || data.state,
    state: data.readyState || data.state,
    status: data.status,
    url: data.url
  };
}

const NETLIFY_API = 'https://api.netlify.com/api/v1';
function netlifyHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, 'User-Agent': 'All-Tools-Nexora-Deploy/6.3.18', ...extra };
}

async function getOrCreateNetlifySite(name, config) {
  const existing = await fetch(`${NETLIFY_API}/sites/${encodeURIComponent(name + '.netlify.app')}`, {
    headers: netlifyHeaders(config.token)
  });
  if (existing.ok) return parseApiResponse(existing);
  if (existing.status !== 404) return parseApiResponse(existing);
  const created = await fetch(`${NETLIFY_API}/sites`, {
    method: 'POST',
    headers: netlifyHeaders(config.token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name })
  });
  return parseApiResponse(created);
}

async function createNetlify(name, archive, config) {
  const site = await getOrCreateNetlifySite(name, config);
  const siteId = site.id || site.site_id;
  if (!siteId) throw new Error('Netlify tidak mengembalikan site ID.');
  const response = await fetch(`${NETLIFY_API}/sites/${encodeURIComponent(siteId)}/deploys`, {
    method: 'POST',
    headers: netlifyHeaders(config.token, { 'Content-Type': 'application/zip' }),
    body: archive
  });
  const data = await parseApiResponse(response);
  return {
    id: data.id,
    state: data.state || 'uploading',
    status: data.state,
    url: data.ssl_url || data.deploy_ssl_url || data.url || data.deploy_url || site.ssl_url || site.url
  };
}

async function statusNetlify(id, config) {
  const response = await fetch(`${NETLIFY_API}/deploys/${encodeURIComponent(id)}`, {
    headers: netlifyHeaders(config.token)
  });
  const data = await parseApiResponse(response);
  return {
    id: data.id || id,
    state: data.state,
    status: data.state,
    url: data.ssl_url || data.deploy_ssl_url || data.url || data.deploy_url
  };
}

function decodeArchive(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Archive ZIP tidak tersedia.');
  const normalized = raw.replace(/^data:application\/zip;base64,/i, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) throw new Error('Archive ZIP tidak valid.');
  const archive = Buffer.from(normalized, 'base64');
  if (!archive.length || archive.length > MAX_ARCHIVE_BYTES) throw new Error('Ukuran ZIP melebihi batas 3,2 MB.');
  return archive;
}

async function handleVDeploy(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return send(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const body = bodyOf(req);
  const action = String(body.action || '').toLowerCase();
  const platform = String(body.platform || 'vercel').toLowerCase() === 'netlify' ? 'netlify' : 'vercel';
  const access = requireAccess(req);
  if (!access.ok) return send(res, access.status, { ok: false, code: access.code, error: access.code, message: access.message });

  const config = providerConfig(platform);
  if (!config.configured) {
    return send(res, 503, {
      ok: false,
      code: 'provider_not_configured',
      error: 'provider_not_configured',
      message: `${platform === 'vercel' ? 'VERCEL_TOKEN' : 'NETLIFY_TOKEN'} belum diatur di environment server.`
    });
  }

  try {
    if (action === 'health') {
      return send(res, 200, { ok: true, status: 'ready', platform, message: `${platform} deploy siap.` });
    }
    if (action === 'create') {
      const name = projectName(body.name);
      if (!name) return send(res, 422, { ok: false, error: 'INVALID_PROJECT_NAME', message: 'Nama project tidak valid.' });
      const archive = decodeArchive(body.archiveBase64);
      const data = platform === 'netlify'
        ? await createNetlify(name, archive, config)
        : await createVercel(name, archive, config);
      return send(res, 200, { ok: true, platform, ...data });
    }
    if (action === 'status') {
      const id = String(body.id || '').trim();
      if (!id || id.length > 180) return send(res, 422, { ok: false, error: 'INVALID_DEPLOYMENT_ID', message: 'Deployment ID tidak valid.' });
      const data = platform === 'netlify'
        ? await statusNetlify(id, config)
        : await statusVercel(id, config);
      return send(res, 200, { ok: true, platform, ...data });
    }
    return send(res, 400, { ok: false, error: 'UNKNOWN_ACTION', message: 'Aksi deploy tidak dikenali.' });
  } catch (error) {
    const message = String(error && error.message ? error.message : 'Deploy gagal.').slice(0, 500);
    const status = Number(error && error.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 502;
    return send(res, status, { ok: false, error: 'DEPLOY_FAILED', message });
  }
}

module.exports = { MAX_ARCHIVE_BYTES, handleVDeploy, extractZip, projectName };
