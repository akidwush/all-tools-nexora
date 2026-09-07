'use strict';
const { databaseRequest } = require('./database');
const { requireAdmin, verifyMutationRequest } = require('./admin-auth');
const { recordAdminAudit } = require('./admin-audit');
const { sendJson: send } = require('./http-response');
const { normalize } = require('../assets/js/shared/brand-config');

module.exports = async function updateBranding(request, response) {
  const session = await requireAdmin(request, response, { edit: true });
  if (!verifyMutationRequest(request)) return send(response, 403, { ok: false, error: 'CSRF_REJECTED' });
  const value = normalize(request.body?.branding);
  if (!value) return send(response, 400, { ok: false, error: 'INVALID_BRANDING', message: 'Gunakan gambar PNG/JPEG/WebP kecil, URL HTTPS, atau path lokal. Kosongkan untuk memakai bawaan.' });
  // A separate settings key avoids overwriting heroVideo during concurrent saves.
  const rows = await databaseRequest('app_settings?on_conflict=key', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ key: 'branding', value, is_public: true, updated_at: new Date().toISOString() })
  });
  const data = Array.isArray(rows) ? rows[0] : null;
  if (!data) return send(response, 500, { ok: false, error: 'BRANDING_SAVE_FAILED' });
  const auditLogged = await recordAdminAudit({ request, session, action: 'settings.branding.update', entityType: 'app_setting', entityId: 'branding', summary: 'Logo dan ikon Nexora diperbarui', after: { logo: value.logoUrl ? 'custom' : 'default', icon: value.iconUrl ? 'custom' : 'logo' } });
  return send(response, 200, { ok: true, data, auditLogged });
};
