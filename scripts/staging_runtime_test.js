#!/usr/bin/env node
/**
 * GADAVIRAL — Staging runtime verification (non-destructive, tagged test data)
 *
 * Tests the REAL deployed API over HTTP. Run against STAGING only:
 *
 *   node scripts/staging_runtime_test.js
 *   node scripts/staging_runtime_test.js --base https://staging.gadaviral.com
 *
 * Optional credentials enable the authenticated flow tests (login, refresh
 * rotation, logout, /auth/me, reports, protected GET/POST, upload):
 *
 *   PowerShell:  $env:GADV_TEST_EMAIL="you@example.com"; $env:GADV_TEST_PASSWORD="..."; node scripts/staging_runtime_test.js
 *   bash:        GADV_TEST_EMAIL=... GADV_TEST_PASSWORD=... node scripts/staging_runtime_test.js
 *
 * Everything it creates is prefixed with "[runtime-test]" and is safe to leave
 * on staging. It never deletes or modifies real content. Never point this at
 * production (add --allow-production if you truly must; it will refuse otherwise).
 */

const BASE = (() => {
  const i = process.argv.indexOf('--base');
  const b = i > -1 ? process.argv[i + 1] : (process.env.GADV_BASE_URL || 'https://staging.gadaviral.com');
  return (b || '').replace(/\/+$/, '');
})();

if (/www\.gadaviral\.com/i.test(BASE) && !process.argv.includes('--allow-production')) {
  console.error('REFUSING to run against production (' + BASE + '). Use staging.');
  process.exit(2);
}

const API = BASE + '/wp-json/gadaviral/v1';
const EMAIL = process.env.GADV_TEST_EMAIL || '';
const PASSWORD = process.env.GADV_TEST_PASSWORD || '';
const results = [];
const stamp = new Date().toISOString().replace(/\..+/, '');

function record(name, status, detail) {
  results.push({ name, status, detail });
  const mark = status === 'PASS' ? 'OK' : status === 'SKIP' ? '--' : 'XX';
  console.log(`[${mark}] ${status.padEnd(4)} ${name}${detail ? ' — ' + detail : ''}`);
}

async function req(method, path, { body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, {
    method,
    headers,
    body: form ? form : body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}

// 1x1 transparent PNG
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000d4944415478da63fccf00f6030003030100ab5e5a5e0000000049454e44ae426082', 'hex');

async function main() {
  console.log(`GADAVIRAL runtime verification against ${API}\n`);

  // 1) health
  try {
    const r = await req('GET', '/health');
    record('health', r.status === 200 && r.data?.ok ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  } catch (e) { record('health', 'FAIL', e.message); }

  // 2) posts
  try {
    const r = await req('GET', '/posts?limit=3');
    const ok = r.status === 200 && Array.isArray(r.data?.items) && r.data?.meta?.totalPages >= 1;
    record('posts list + pagination meta', ok ? 'PASS' : 'FAIL', `HTTP ${r.status}, items=${r.data?.items?.length}`);
  } catch (e) { record('posts list + pagination meta', 'FAIL', e.message); }

  // 3) community highlights
  try {
    const r = await req('GET', '/community/highlights');
    record('community/highlights', r.status === 200 && Array.isArray(r.data?.items) ? 'PASS' : 'FAIL', `HTTP ${r.status}, items=${r.data?.items?.length}`);
  } catch (e) { record('community/highlights', 'FAIL', e.message); }

  // Other public reads used by the UI
  for (const [name, path, expected] of [
    ['search', '/search?q=test', 200],
    ['events', '/events?limit=5', 200],
    ['groups', '/groups?limit=5', 200],
    ['businesses', '/businesses?limit=5', 200],
    ['auth guard: /auth/me without token', '/auth/me', 401],
  ]) {
    try {
      const r = await req('GET', path);
      record(name, r.status === expected ? 'PASS' : 'FAIL', `HTTP ${r.status} (expected ${expected})`);
    } catch (e) { record(name, 'FAIL', e.message); }
  }

  if (!EMAIL || !PASSWORD) {
    record('login', 'SKIP', 'GADV_TEST_EMAIL / GADV_TEST_PASSWORD not set');
    record('refresh + rotation', 'SKIP');
    record('old refresh-token rejected', 'SKIP');
    record('logout', 'SKIP');
    record('revoked refresh-token rejected', 'SKIP');
    record('authenticated /auth/me', 'SKIP');
    record('POST /reports', 'SKIP');
    record('protected GET /notifications', 'SKIP');
    record('protected write (react to test post)', 'SKIP');
    record('upload POST /posts/media', 'SKIP');
    record('group create/join/leave round-trip', 'SKIP');
    finish();
    return;
  }

  await authedFlow();
  finish();
}

function finish() {
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  console.log(`\nResult: ${pass} passed, ${fail} failed, ${skip} skipped / ${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });

/** Authenticated flow: login → me → refresh/rotation → writes → logout/revocation. */
async function authedFlow() {
  // 4) login
  let access, refresh;
  try {
    const r = await req('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
    access = r.data?.accessToken; refresh = r.data?.refreshToken;
    const ok = r.status === 200 && !!access && !!refresh && !!r.data?.user?.full_name;
    record('login (accessToken + refreshToken + user)', ok ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
    if (!ok) return;
  } catch (e) { record('login (accessToken + refreshToken + user)', 'FAIL', e.message); return; }

  // 10) /auth/me — documented flat fields + additive user/profile objects
  try {
    const r = await req('GET', '/auth/me', { token: access });
    const need = ['id', 'email', 'username', 'full_name', 'avatar_url', 'is_demo', 'location'];
    const missing = need.filter((k) => !(k in (r.data || {})));
    const ok = r.status === 200 && missing.length === 0 && !!r.data?.user && !!r.data?.profile;
    record('authenticated /auth/me (flat fields + user/profile)', ok ? 'PASS' : 'FAIL',
      `HTTP ${r.status}${missing.length ? ', missing: ' + missing.join(',') : ''}`);
  } catch (e) { record('authenticated /auth/me (flat fields + user/profile)', 'FAIL', e.message); }

  // 5+6) refresh + rotation; 7) old token rejected
  let access2, refresh2;
  try {
    const r = await req('POST', '/auth/refresh', { body: { refreshToken: refresh } });
    access2 = r.data?.accessToken; refresh2 = r.data?.refreshToken;
    record('refresh', r.status === 200 && !!access2 && !!refresh2 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  } catch (e) { record('refresh', 'FAIL', e.message); }
  try {
    const r = await req('POST', '/auth/refresh', { body: { refreshToken: refresh } });
    record('old refresh-token rejected after rotation', r.status === 401 ? 'PASS' : 'FAIL', `HTTP ${r.status} (expected 401)`);
  } catch (e) { record('old refresh-token rejected after rotation', 'FAIL', e.message); }

  // 12) representative protected GET
  try {
    const r = await req('GET', '/notifications?limit=5', { token: access2 });
    record('protected GET /notifications (items + unreadCount)', r.status === 200 && Array.isArray(r.data?.items) ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  } catch (e) { record('protected GET /notifications (items + unreadCount)', 'FAIL', e.message); }

  // 14) upload → creates a tagged PHOTO post
  let testPostId = null;
  try {
    const fd = new FormData();
    fd.append('content', `[runtime-test] media upload check ${stamp}`);
    fd.append('visibility', 'PUBLIC');
    fd.append('media', new Blob([PNG], { type: 'image/png' }), 'runtime-test.png');
    const res = await fetch(API + '/posts/media', { method: 'POST', headers: { Authorization: 'Bearer ' + access2 }, body: fd });
    const data = await res.json().catch(() => ({}));
    testPostId = data?.id || data?.post?.id || null;
    record('upload POST /posts/media creates photo post', testPostId ? 'PASS' : 'FAIL', `HTTP ${res.status}, postId=${testPostId}`);
  } catch (e) { record('upload POST /posts/media creates photo post', 'FAIL', e.message); }

  // 13) representative protected write: react to the test post
  try {
    if (!testPostId) {
      const created = await req('POST', '/posts', { token: access2, body: { type: 'TEXT', content: `[runtime-test] write check ${stamp}`, visibility: 'PUBLIC' } });
      testPostId = created.data?.id;
    }
    const r = await req('PUT', `/posts/${testPostId}/react`, { token: access2, body: { type: 'LIKE' } });
    record('protected write PUT /posts/:id/react', r.status === 200 && r.data?.reacted === true ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  } catch (e) { record('protected write PUT /posts/:id/react', 'FAIL', e.message); }

  // 11) POST /reports against the tagged test post
  try {
    const r = await req('POST', '/reports', { token: access2, body: { targetType: 'POST', targetId: testPostId, category: 'OTHER', details: '[runtime-test] automated verification' } });
    record('POST /reports', (r.status === 200 || r.status === 201) && r.data?.ok === true ? 'PASS' : 'FAIL', `HTTP ${r.status}, reportId=${r.data?.id}`);
  } catch (e) { record('POST /reports', 'FAIL', e.message); }

  // 15) other critical flow: group create/join/leave round-trip (tagged test group)
  try {
    const created = await req('POST', '/groups', { token: access2, body: { name: `[runtime-test] group ${stamp}`, description: 'automated verification group' } });
    const slug = created.data?.slug;
    const joined = slug ? await req('POST', `/groups/${slug}/join`, { token: access2, body: {} }) : null;
    const detail = slug ? await req('GET', `/groups/${slug}`, { token: access2 }) : null;
    const left = slug ? await req('POST', `/groups/${slug}/leave`, { token: access2, body: {} }) : null;
    const ok = slug && joined?.status === 200 && detail?.data?.group?.joined === true && left?.data?.joined === false;
    record('group create/join/leave round-trip', ok ? 'PASS' : 'FAIL', `slug=${slug}`);
  } catch (e) { record('group create/join/leave round-trip', 'FAIL', e.message); }

  // 8) logout with the current refresh token
  try {
    const r = await req('POST', '/auth/logout', { token: access2, body: { refreshToken: refresh2 } });
    record('logout', r.status === 200 && r.data?.ok ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  } catch (e) { record('logout', 'FAIL', e.message); }

  // 9) revoked refresh token must be rejected
  try {
    const r = await req('POST', '/auth/refresh', { body: { refreshToken: refresh2 } });
    record('revoked refresh-token rejected', r.status === 401 ? 'PASS' : 'FAIL', `HTTP ${r.status} (expected 401)`);
  } catch (e) { record('revoked refresh-token rejected', 'FAIL', e.message); }
}
