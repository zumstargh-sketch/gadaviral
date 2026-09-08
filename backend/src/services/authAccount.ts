import { sql } from '../db/client.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword, randomToken, sha256 } from '../utils/crypto.js';
import { ApiError } from '../utils/errors.js';
import { emails } from './emailTemplates.js';
import { audit } from './audit.js';
import { revokeAllSessions } from './tokens.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  if (newPassword.length < 8) throw ApiError.badRequest('Password must be at least 8 characters');
  const rows = await sql`SELECT password_hash, email FROM users WHERE id = ${userId}`;
  const user = rows[0];
  if (!user?.password_hash || !verifyPassword(currentPassword, user.password_hash)) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  await sql`
    UPDATE users SET password_hash = ${hashPassword(newPassword)}, password_changed_at = now()
    WHERE id = ${userId}`;
  await revokeAllSessions(userId);
  await audit(userId, 'PASSWORD_CHANGED', 'user', userId);
  await emails.securityAlert(user.email, 'Your GADAVIRAL password was changed',
    'Your GADAVIRAL password was just changed. If this was not you, contact support immediately.');
  return { message: 'Password updated. Please log in again on your other devices.' };
}

/** Email change: confirm current password, then verify ownership of the NEW address. */
export async function requestEmailChange(userId: string, newEmailRaw: string, currentPassword: string) {
  const newEmail = newEmailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(newEmail)) throw ApiError.badRequest('Enter a valid new email address');
  const rows = await sql`SELECT password_hash, full_name FROM users WHERE id = ${userId}`;
  const user = rows[0];
  if (!user?.password_hash || !verifyPassword(currentPassword, user.password_hash)) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  const taken = await sql`
    SELECT 1 FROM users WHERE email = ${newEmail} AND id <> ${userId} AND deleted_at IS NULL`;
  if (taken.length > 0) throw ApiError.conflict('That email is already in use');

  await sql`
    UPDATE email_tokens SET consumed_at = now()
    WHERE user_id = ${userId} AND purpose = 'CHANGE_EMAIL' AND consumed_at IS NULL`;
  const token = randomToken(32);
  const expires = new Date(Date.now() + config.emailTokens.verifyTtl * 1000);
  await sql`
    INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at, payload)
    VALUES (${userId}, 'CHANGE_EMAIL', ${sha256(token)}, ${expires},
            ${JSON.stringify({ newEmail })}::jsonb)`;
  const url = `${config.apiBaseUrl}/api/v1/auth/confirm-email?token=${encodeURIComponent(token)}`;
  await emails.emailChange(newEmail, user.full_name, url, newEmail, config.emailTokens.verifyTtl);
  return { message: 'Check your new email address to confirm the change.' };
}

export async function confirmEmailChange(token: string) {
  const rows = await sql`
    SELECT et.*, u.id AS uid FROM email_tokens et
    JOIN users u ON u.id = et.user_id
    WHERE et.purpose = 'CHANGE_EMAIL' AND et.token_hash = ${sha256(token)}
    ORDER BY et.created_at DESC LIMIT 1`;
  const row = rows[0];
  if (!row) throw ApiError.badRequest('Invalid confirmation link');
  if (row.consumed_at) throw ApiError.gone('This confirmation link was already used');
  if (new Date(row.expires_at) < new Date()) throw ApiError.gone('This confirmation link has expired');
  const payloadRaw = row.payload;
  const payload = typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : payloadRaw;
  const newEmail = payload?.newEmail;
  if (!newEmail) throw ApiError.badRequest('Corrupt token payload');
  const taken = await sql`
    SELECT 1 FROM users WHERE email = ${newEmail} AND id <> ${row.uid} AND deleted_at IS NULL`;
  if (taken.length > 0) throw ApiError.conflict('That email is already in use');

  await sql`
    UPDATE users SET email = ${newEmail}, email_verified = true, email_verified_at = now()
    WHERE id = ${row.uid}`;
  await sql`UPDATE email_tokens SET consumed_at = now() WHERE id = ${row.id}`;
  await audit(row.uid, 'EMAIL_CHANGED', 'user', row.uid, { newEmail });
  return { message: 'Your email address has been updated.' };
}
