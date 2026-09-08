import 'dotenv/config';
import { sql } from '../src/db/client.js';
import { hashPassword } from '../src/utils/crypto.js';

/**
 * Create or promote a SUPER_ADMIN — the ONLY mechanism that grants admin roles
 * at bootstrap (spec §28, §94: Google login never auto-grants admin).
 *
 * Usage: npm run create-admin -- admin@gadaviral.com "Admin Name" [password]
 */
const email = process.argv[2]?.toLowerCase();
const fullName = process.argv[3] ?? 'GADAVIRAL Admin';
const password = process.argv[4];

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Usage: npm run create-admin -- <email> "<full name>" [password]');
  process.exit(1);
}

const existing = await sql`SELECT id, role FROM users WHERE email = ${email}`;
if (existing.length > 0) {
  await sql`UPDATE users SET role = 'SUPER_ADMIN', status = 'ACTIVE', email_verified = true,
            email_verified_at = COALESCE(email_verified_at, now()) WHERE id = ${existing[0].id}`;
  if (password) {
    await sql`UPDATE users SET password_hash = ${hashPassword(password)} WHERE id = ${existing[0].id}`;
  }
  console.log(`Promoted ${email} to SUPER_ADMIN.`);
} else {
  const slug = email.split('@')[0].replace(/[^a-z0-9_]/g, '_').slice(0, 28) || 'admin';
  let username = slug;
  let n = 1;
  while ((await sql`SELECT 1 FROM users WHERE username = ${username}`).length > 0) {
    username = `${slug}_${n++}`;
  }
  const rows = await sql`
    INSERT INTO users (email, password_hash, full_name, username, role, email_verified, email_verified_at, auth_provider)
    VALUES (${email}, ${hashPassword(password ?? 'ChangeMe-' + Math.random().toString(36).slice(2, 10))},
            ${fullName}, ${username}, 'SUPER_ADMIN', true, now(), 'EMAIL')
    RETURNING id`;
  await sql`INSERT INTO profiles (user_id) VALUES (${rows[0].id})`;
  console.log(`Created SUPER_ADMIN ${email} (username: ${username}).`);
}
await sql.end();
