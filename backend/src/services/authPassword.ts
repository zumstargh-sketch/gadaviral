import { sql } from '../db/client.js';
import { config } from '../config.js';
import { hashPassword, randomToken, sha256 } from '../utils/crypto.js';
import { ApiError } from '../utils/errors.js';
import { emails } from './emailTemplates.js';
import { audit } from './audit.js';
import { revokeAllSessions } from './tokens.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Password reset request — never reveals whether the account exists (§26). */
export async function requestPasswordReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { message: 'If that account exists, a reset link has been sent.' };
  }
  const rows = await sql`
    SELECT id, full_name FROM users WHERE email = ${email} AND deleted_at IS NULL`;
  if (rows.length > 0) {
    const user = rows[0];
    await sql`
      UPDATE email_tokens SET consumed_at = now()
      WHERE user_id = ${user.id} AND purpose = 'RESET_PASSWORD' AND consumed_at IS NULL`;
    const token = randomToken(32);
    const expires = new Date(Date.now() + config.emailTokens.resetTtl * 1000);
    await sql`
      INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at)
      VALUES (${user.id}, 'RESET_PASSWORD', ${sha256(token)}, ${expires})`;
    const url = `${config.webAppUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await emails.passwordReset(email, user.full_name, url, config.emailTokens.resetTtl);
  }
  return { message: 'If that account exists, a reset link has been sent.' };
}

export async function resetPassword(token: string, newPassword: string) {
  if (newPassword.length < 8) throw ApiError.badRequest('Password must be at least 8 characters');
  const rows = await sql`
    SELECT et.*, u.id AS uid, u.email FROM email_tokens et
    JOIN users u ON u.id = et.user_id
    WHERE et.purpose = 'RESET_PASSWORD' AND et.token_hash = ${sha256(token)}
    ORDER BY et.created_at DESC LIMIT 1`;
  const row = rows[0];
  if (!row) throw ApiError.badRequest('Invalid reset link');
  if (row.consumed_at) throw ApiError.gone('This reset link was already used');
  if (new Date(row.expires_at) < new Date()) throw ApiError.gone('This reset link has expired');

  await sql`
    UPDATE users SET password_hash = ${hashPassword(newPassword)}, password_changed_at = now()
    WHERE id = ${row.uid}`;
  await sql`UPDATE email_tokens SET consumed_at = now() WHERE id = ${row.id}`;
  await revokeAllSessions(row.uid);
  await audit(row.uid, 'PASSWORD_RESET', 'user', row.uid);
  await emails.securityAlert(row.email, 'Your GADAVIRAL password was changed',
    'Your GADAVIRAL password was just reset. If this was not you, contact support immediately.');
  return { message: 'Password updated. Log in with your new password.' };
}
