/**
 * GADAVIRAL — LIVE end-to-end smoke test (spec §99).
 * Runs against the real API + database: register → verify (outbox OTP) → login →
 * post → react/comment/reply/share → follow → poll vote → messaging → search →
 * report → moderation queue → forgot/reset password → admin → WIPE demo data
 * (real user must survive) → REGENERATE demo data (no duplication).
 *
 * Run:  npx tsx tests/e2e-smoke.ts      (API must be running on :4000)
 */
import 'dotenv/config';
import postgres from 'postgres';
import { config } from '../src/config.js';
import { hashPassword } from '../src/utils/crypto.js';

const BASE = process.env.E2E_BASE ?? 'http://localhost:4000/api/v1';
const db = postgres(config.databaseUrl, { max: 2, onnotice: () => {} });

let passed = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, extra?: any) {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else {
    failures.push(name);
    console.log(`  ✗ ${name}${extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : ''}`);
  }
}
async function req(method: string, path: string, body?: any, token?: string) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = {}; try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: res.status, json };
}

async function main() {
  const stamp = Date.now();
  const email = `e2e-smoke-${stamp}@gadaviral.test`;
  const password = 'E2eSmoke-2026!';

  // ── 1. Registration + verification email ──────────────────────────
  console.log('\n■ Authentication');
  const reg = await req('POST', '/auth/register', {
    email, password, fullName: 'E2E Smoke Tester', username: `e2e_smoke_${stamp % 100000}`,
  });
  ok('register (202 + verification queued)', reg.status === 202, reg.json);

  const mail = await db`
    SELECT subject, template, html FROM outbox_emails
    WHERE to_email = ${email} ORDER BY sent_at DESC LIMIT 1`;
  ok('verification email sent, sender configured as GADAVIRAL <admin@gadaviral.com>',
    mail.length === 1 && config.smtp.fromEmail === 'admin@gadaviral.com' && /GADAVIRAL/i.test(mail[0].html),
    { mails: mail.length, fromEmail: config.smtp.fromEmail });
  const otpMatch = String(mail[0]?.html ?? '').match(/verification code[^0-9]*(\d{6})/i)
    ?? String(mail[0]?.html ?? '').match(/\b(\d{6})\b/);
  ok('6-digit OTP present in email', !!otpMatch, mail[0]?.subject);

  // ── 2. OTP verification + login ───────────────────────────────────
  const otp = otpMatch?.[1] ?? '000000';
  const wrong = await req('POST', '/auth/verify-otp', { email, otp: otp === '123456' ? '654321' : '123456' });
  ok('wrong OTP rejected', wrong.status >= 400, wrong.status);
  const ver = await req('POST', '/auth/verify-otp', { email, otp });
  ok('correct OTP verifies email', ver.status === 200 && ver.json.verified === true, ver.json);
  const reused = await req('POST', '/auth/verify-otp', { email, otp });
  ok('OTP single-use (reuse rejected)', reused.status >= 400, reused.status);

  const login = await req('POST', '/auth/login', { email, password });
  const token = login.json.accessToken as string | undefined;
  ok('login returns access token', login.status === 200 && !!token, login.status);
  const me = await req('GET', '/auth/me', undefined, token);
  ok('GET /auth/me (authenticated session)', me.status === 200 && me.json.user?.email === email, me.status);

  // ── 3. Post + social interactions ─────────────────────────────────
  console.log('\n■ Social features');
  const post = await req('POST', '/posts', { type: 'TEXT', content: 'E2E smoke: testing the new GADAVIRAL feed. What should we improve?' }, token);
  const myPostId = post.json.post?.id;
  ok('create post (moderated, published)', post.status === 201 && !!myPostId && post.json.post.status === 'ACTIVE', post.status);

  const demoUser = (await db`
    SELECT id, username FROM users WHERE is_demo = true AND status = 'ACTIVE' AND deleted_at IS NULL
    ORDER BY follower_count DESC NULLS LAST LIMIT 1`)[0];
  const demoPost = (await db`
    SELECT p.id FROM posts p JOIN users u ON u.id = p.author_id
    WHERE u.is_demo = true AND p.status = 'ACTIVE' AND p.visibility = 'PUBLIC'
    ORDER BY p.reaction_count DESC NULLS LAST LIMIT 1`)[0];
  ok('demo users + posts available', !!demoUser && !!demoPost, { demoUser: !!demoUser, demoPost: !!demoPost });

  const react = await req('PUT', `/posts/${demoPost.id}/react`, { type: 'LOVE' }, token);
  ok('react to a demo post', react.status === 200 && react.json.reacted === true, react.status);
  const reactDup = await req('PUT', `/posts/${demoPost.id}/react`, { type: 'LOVE' }, token);
  ok('duplicate reaction idempotent (changed:false)', reactDup.json.changed === false, reactDup.json);

  const cmt = await req('POST', `/posts/${demoPost.id}/comments`, { content: 'E2E smoke comment — great cultural content!' }, token);
  const commentId = cmt.json.comment?.id;
  ok('comment on demo post', cmt.status === 201 && !!commentId, cmt.status);
  const reply = await req('POST', `/posts/${demoPost.id}/comments`, { content: 'And a threaded reply for the smoke test.', parentCommentId: commentId }, token);
  ok('threaded reply', reply.status === 201 && reply.json.comment?.parent_comment_id === commentId, reply.status);

  const share = await req('POST', `/posts/${demoPost.id}/share`, { caption: 'Sharing this — worth a read.' }, token);
  ok('share demo post (real share record)', share.status === 201 && !!share.json.share?.id, share.status);

  const follow = await req('POST', `/users/${demoUser.username}/follow`, undefined, token);
  ok('follow demo user', follow.status === 200 && follow.json.following === true, follow.status);

  const pollRow = (await db`
    SELECT p.id AS post_id, po.id AS option_id FROM posts p
    JOIN polls pl ON pl.post_id = p.id
    JOIN poll_options po ON po.poll_id = pl.id
    JOIN users u ON u.id = p.author_id
    WHERE u.is_demo = true AND p.status = 'ACTIVE'
    ORDER BY pl.created_at DESC, po.position LIMIT 1`)[0];
  if (pollRow) {
    const vote = await req('POST', `/posts/${pollRow.post_id}/vote`, { optionId: pollRow.option_id }, token);
    ok('vote on a demo poll', vote.status === 201 && vote.json.voted === true, vote.status);
  }

  const notif = await req('GET', '/notifications?limit=5', undefined, token);
  ok('notifications endpoint (real records)', notif.status === 200 && Array.isArray(notif.json.items), notif.status);

  // ── 4. Messaging ──────────────────────────────────────────────────
  console.log('\n■ Messaging');
  const conv = await req('POST', '/messages/conversations', { username: demoUser.username }, token);
  const convId = conv.json.conversationId;
  ok('open conversation with demo user', [200, 201].includes(conv.status) && !!convId, conv.status);
  const msg = await req('POST', `/messages/conversations/${convId}`, { content: 'E2E smoke: hello from the live test!' }, token);
  ok('send message (moderated + persisted)', msg.status === 201 && !!msg.json.message?.id, msg.status);
  const history = await req('GET', `/messages/conversations/${convId}`, undefined, token);
  ok('conversation history + read state', history.status === 200 && history.json.items.length >= 1, history.status);

  // ── 5. Search + reports ───────────────────────────────────────────
  console.log('\n■ Search & reporting');
  const search = await req('GET', '/search?q=Homowo');
  ok('search finds cultural content',
    search.status === 200 && (search.json.posts.length > 0 || search.json.groups.length > 0),
    { posts: search.json.posts.length, groups: search.json.groups.length });

  const report = await req('POST', '/reports', {
    targetType: 'POST', targetId: demoPost.id, category: 'SPAM', details: 'E2E smoke test report',
  }, token);
  ok('report filed (goes to moderation queue)', report.status === 201 && !!report.json.reportId, report.status);

  // ── 6. Password reset (email from admin@gadaviral.com) ────────────
  console.log('\n■ Password reset');
  await req('POST', '/auth/forgot-password', { email });
  const resetMail = await db`
    SELECT html FROM outbox_emails WHERE to_email = ${email}
      AND html ILIKE '%reset%' ORDER BY sent_at DESC LIMIT 1`;
  const resetToken = String(resetMail[0]?.html ?? '').match(/reset-password\?token=([A-Za-z0-9_\-]+)/)?.[1];
  ok('reset email contains single-use link', !!resetToken, resetMail[0]?.html?.slice(0, 80));
  const newPass = 'E2eSmoke-2027!';
  const reset = await req('POST', '/auth/reset-password', { token: resetToken, password: newPass });
  ok('password reset with link token', reset.status === 200, reset.json);
  const oldLogin = await req('POST', '/auth/login', { email, password });
  ok('old password rejected after reset', oldLogin.status === 401 || oldLogin.status === 403, oldLogin.status);
  const newLogin = await req('POST', '/auth/login', { email, password: newPass });
  ok('login with new password', newLogin.status === 200 && !!newLogin.json.accessToken, newLogin.status);

  // ── 7. Admin dashboard + demo lifecycle (§99: 28–34) ──────────────
  console.log('\n■ Admin & demo data lifecycle');
  const adminEmail = 'e2e-admin@gadaviral.test';
  // Bootstrap SUPER_ADMIN through the create-admin mechanism (only admin path).
  const existing = await db`SELECT id FROM users WHERE email = ${adminEmail}`;
  if (existing.length > 0) {
    await db`UPDATE users SET role = 'SUPER_ADMIN', status = 'ACTIVE', email_verified = true,
             password_hash = ${hashPassword('E2eAdmin-2026!')} WHERE id = ${existing[0].id}`;
  } else {
    const rows = await db`
      INSERT INTO users (email, password_hash, full_name, username, role, email_verified, email_verified_at, auth_provider)
      VALUES (${adminEmail}, ${hashPassword('E2eAdmin-2026!')}, 'E2E Admin', 'e2e_admin', 'SUPER_ADMIN', true, now(), 'EMAIL')
      RETURNING id`;
    await db`INSERT INTO profiles (user_id) VALUES (${rows[0].id})`;
  }
  const adminLogin = await req('POST', '/auth/login', { email: adminEmail, password: 'E2eAdmin-2026!' });
  const adminToken = adminLogin.json.accessToken;
  ok('admin login (RBAC bootstrap)', adminLogin.status === 200 && adminLogin.json.user?.role === 'SUPER_ADMIN', adminLogin.json.user?.role);

  const noAuth = await req('GET', '/admin/analytics');
  ok('admin endpoints blocked without auth', noAuth.status === 401, noAuth.status);

  const analytics = await req('GET', '/admin/analytics', undefined, adminToken);
  ok('admin analytics', analytics.status === 200 && !!analytics.json.totals?.users, analytics.status);

  const queue = await req('GET', '/moderation/queue', undefined, adminToken);
  ok('moderation queue contains our report',
    queue.status === 200 && (queue.json.items ?? []).some((r: any) => r.target_id === demoPost.id),
    (queue.json.items ?? []).length);

  const statsBefore = await req('GET', '/admin/demo/stats', undefined, adminToken);
  ok('demo stats (before wipe)', statsBefore.status === 200 && statsBefore.json.users >= 116, statsBefore.json.users);

  const wipe = await req('POST', '/admin/demo/wipe', {}, adminToken);
  ok('DELETE ALL DEMO DATA', wipe.status === 200 && wipe.json.ok === true, wipe.status);

  const statsWiped = await req('GET', '/admin/demo/stats', undefined, adminToken);
  ok('demo data fully removed (users+posts = 0)',
    Number(statsWiped.json.users) === 0 && Number(statsWiped.json.posts) === 0,
    { users: statsWiped.json.users, posts: statsWiped.json.posts });

  const survivor = await req('POST', '/auth/login', { email, password: newPass });
  ok('REAL user survives demo wipe (§101)', survivor.status === 200 && !!survivor.json.accessToken, survivor.status);

  console.log('  … regenerating demo data (up to ~90s) …');
  const seed = await req('POST', '/admin/demo/seed', { force: true }, adminToken);
  ok('REGENERATE DEMO DATA (117 users, 150 posts)',
    seed.status === 200 && seed.json.report?.posts === 150 && seed.json.report?.users === 117,
    { status: seed.status, users: seed.json.report?.users, posts: seed.json.report?.posts });

  const verifyRes = await req('GET', '/admin/demo/verify', undefined, adminToken);
  const badChecks = (verifyRes.json.issues ?? []).filter((i: any) => i.ok !== true);
  ok('§98 demo validation — all checks pass', verifyRes.status === 200 && badChecks.length === 0, badChecks);

  // ── Summary ───────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════`);
  console.log(`  E2E SMOKE: ${passed} passed, ${failures.length} failed`);
  console.log(`  Real test account kept: ${email} (proves §101 separation)`);
  console.log(`══════════════════════════════════════`);
  if (failures.length > 0) { console.log('  Failures: ' + failures.join(' | ')); process.exitCode = 1; }
}

main()
  .then(() => db.end())
  .catch((e) => { console.error('SMOKE CRASH:', e); process.exit(1); });
