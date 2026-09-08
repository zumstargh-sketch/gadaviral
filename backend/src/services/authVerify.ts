import { sql } from '../db/client.js';
import { sha256 } from '../utils/crypto.js';
import { ApiError } from '../utils/errors.js';
import { audit } from './audit.js';
import { config } from '../config.js';

async function consume(row: any) {
  if (row.consumed_at) throw ApiError.gone('This link or code was already used');
  if (new Date(row.expires_at) < new Date()) throw ApiError.gone('This link or code has expired');
  await sql`UPDATE email_tokens SET consumed_at = now() WHERE id = ${row.id}`;
}

/** Email verification via single-use, time-limited confirmation link. */
export async function verifyEmailByToken(token: string) {
  const rows = await sql`
    SELECT et.*, u.id AS uid, u.email, u.email_verified
    FROM email_tokens et JOIN users u ON u.id = et.user_id
    WHERE et.purpose = 'VERIFY_EMAIL' AND et.token_hash = ${sha256(token)}
    ORDER BY et.created_at DESC LIMIT 1`;
  const row = rows[0];
  if (!row) throw ApiError.badRequest('Invalid verification link');
  await consume(row);
  await sql`
    UPDATE users SET email_verified = true, email_verified_at = now(),
      auth_provider = CASE WHEN auth_provider = 'GOOGLE' THEN 'LINKED' ELSE auth_provider END
    WHERE id = ${row.uid}`;
  await sql`
    UPDATE email_tokens SET consumed_at = now()
    WHERE user_id = ${row.uid} AND purpose = 'OTP_VERIFY' AND consumed_at IS NULL`;
  await audit(row.uid, 'EMAIL_VERIFIED', 'user', row.uid, { method: 'link' });
  return { email: String(row.email) };
}

/** Email verification via 6-digit OTP: hashed storage, attempt limit, single use. */
export async function verifyEmailByOtp(emailRaw: string, otp: string) {
  const email = emailRaw.trim().toLowerCase();
  const rows = await sql`
    SELECT et.*, u.id AS uid FROM email_tokens et
    JOIN users u ON u.id = et.user_id
    WHERE et.purpose = 'OTP_VERIFY' AND et.consumed_at IS NULL
      AND u.email = ${email} AND u.deleted_at IS NULL
    ORDER BY et.created_at DESC LIMIT 1`;
  const row = rows[0];
  if (!row) throw ApiError.badRequest('Request a new verification code');
  if (new Date(row.expires_at) < new Date()) throw ApiError.gone('This code has expired. Request a new one.');
  if (row.attempts >= config.emailTokens.otpMaxAttempts) {
    await sql`UPDATE email_tokens SET consumed_at = now() WHERE id = ${row.id}`;
    throw ApiError.gone('Too many incorrect attempts. Request a new code.');
  }
  if (row.otp_hash !== sha256(otp)) {
    await sql`UPDATE email_tokens SET attempts = attempts + 1 WHERE id = ${row.id}`;
    const left = config.emailTokens.otpMaxAttempts - row.attempts - 1;
    throw ApiError.badRequest(`Incorrect code. ${Math.max(0, left)} attempt(s) remaining.`);
  }
  await consume(row);
  await sql`
    UPDATE users SET email_verified = true, email_verified_at = now(),
      auth_provider = CASE WHEN auth_provider = 'GOOGLE' THEN 'LINKED' ELSE auth_provider END
    WHERE id = ${row.uid}`;
  await sql`
    UPDATE email_tokens SET consumed_at = now()
    WHERE user_id = ${row.uid} AND purpose = 'VERIFY_EMAIL' AND consumed_at IS NULL`;
  await audit(row.uid, 'EMAIL_VERIFIED', 'user', row.uid, { method: 'otp' });
  return { email };
}
