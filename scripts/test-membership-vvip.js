const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

const migration=read("database/migrations/022_membership_vvip.sql");
assert.match(migration,/create table if not exists public\.profiles/i);
assert.match(migration,/create table if not exists public\.subscriptions/i);
assert.match(migration,/access_level in \('free','vvip'\)/i);
assert.match(migration,/enable row level security/i);
assert.match(migration,/grant update\(display_name,avatar_url\)/i);

const account=read("lib/account-membership.js");
assert.match(account,/HttpOnly/i);
assert.match(account,/nx_account_csrf/);
assert.match(account,/expires_at.*Date\.now/);
assert.match(account,/VVIP_LOGIN_REQUIRED/);
assert.doesNotMatch(account,/SUPABASE_SERVICE_ROLE_KEY/);

const publicUi=read("assets/js/core/account.js");
assert.match(publicUi,/adopt-session/);
assert.match(publicUi,/reset-password/);
assert.match(publicUi,/whatsapp_access/);
assert.match(publicUi,/data-access-level='vvip'/);

const admin=read("api/admin/tools.js");
assert.match(admin,/resource.*members/);
assert.match(admin,/membership\.\$\{action\}/);
assert.match(admin,/ADMIN_MEMBER_PROTECTED/);
assert.match(admin,/current>now\?current:now/);

const toolHealth=read("api/tool-health.js");
assert.match(toolHealth,/authorizeTool/);
assert.match(toolHealth,/mode === "account"/);
assert.match(read("vercel.json"),/\/api\/account/);
assert.match(read("route-manifest.json"),/\/api\/account/);

console.log("Membership FREE/VVIP checks passed: Auth cookies, expiry, RLS, admin lifecycle, public lock, and backend guard are wired.");
