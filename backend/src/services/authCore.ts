import { sql } from '../db/client.js';
import { config } from '../config.js';
import { randomToken, sha256, generateOtp } from '../utils/crypto.js';
import { ApiError } from '../utils/errors.js';
import { emails } from './emailTemplates.js';
import { audit } from './audit.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function slugifyUsername(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 24);
  return slug || 'user';
}

export async function usernameTaken(username: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM users WHERE username = ${username} LIMIT 1`;
  return rows.length > 0;
}

/** Natural, human username suggestion per spec §11 (never "user93847291" first). */
export async function suggestUsername(displayName: string): Promise<string> {
  const base = slugifyUsername(displayName);
  const parts = base.split('_').filter(Boolean);
  const candidates = [
    base,
    `${base}_gh`,
    parts.length > 1 ? base : `${base}_ga`,
    `${parts[0] ?? 'user'}_${parts.slice(1).join('_') || 'gh'}`,
  ].filter((c) => /^[a-z0-9_]{3,30}$/.test(c));
  for (const c of candidates) {
    if (!(await usernameTaken(c))) return c;
  }
  // Natural numbered variants before any fallback
  for (let n = 1; n <= 99; n++) {
    const c = `${base}_${n}`;
    if (/^[a-z0-9_]{3,30}$/.test(c) && !(await usernameTaken(c))) return c;
  }
  let n = Math.floor(Math.random() * 90000) + 10000;
  let candidate = `user_${n}`;
  while (await usernameTaken(candidate)) {
    n += 1;
    candidate = `user_${n}`;
  }
  return candidate;
}

export async function issueVerification(userId: string, email: string, fullName: string) {
  await sql`
    UPDATE email_tokens SET consumed_at = now()
    WHERE user_id = ${userId} AND purpose IN ('VERIFY_EMAIL','OTP_VERIFY') AND consumed_at IS NULL`;

  const linkToken = randomToken(32);
  const otp = generateOtp();
  const linkExpires = new Date(Date.now() + config.emailTokens.verifyTtl * 1000);
  const otpExpires = new Date(Date.now() + config.emailTokens.otpTtl * 1000);
  await sql`
    INSERT INTO email_tokens (user_id, purpose, token_hash, otp_hash, expires_at)
    VALUES (${userId}, 'VERIFY_EMAIL', ${sha256(linkToken)}, NULL, ${linkExpires}),
           (${userId}, 'OTP_VERIFY', NULL, ${sha256(otp)}, ${otpExpires})`;

  const verifyUrl = `${config.apiBaseUrl}/api/v1/auth/verify-email?token=${encodeURIComponent(linkToken)}`;
  await emails.verifyEmail(email, fullName, verifyUrl, otp, config.emailTokens.otpTtl);
  return { linkToken, otp };
}

export async function register(input: {
  email: string; password: string; fullName: string; username?: string;
}) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw ApiError.badRequest('Enter a valid email address');
  if (input.password.length < 8) throw ApiError.badRequest('Password must be at least 8 characters');
  const fullName = input.fullName.trim();
  if (fullName.length < 2 || fullName.length > 80) throw ApiError.badRequest('Enter your full name');

  const existing = await sql`
    SELECT id FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;
  if (existing.length > 0) {
    // Anti-enumeration: identical response whether or not the account exists.
    return { message: 'Check your email to verify your GADAVIRAL account.' };
  }

  let username = input.username?.trim().toLowerCase() ?? (await suggestUsername(fullName));
  if (!/^[a-z0-9_]{3,30}$/.test(username) || (await usernameTaken(username))) {
    username = await suggestUsername(username.length >= 3 ? username : fullName);
  }

  const { hashPassword } = await import('../utils/crypto.js');
  const passwordHash = hashPassword(input.password);
  const rows = await sql`
    INSERT INTO users (email, password_hash, full_name, username, auth_provider)
    VALUES (${email}, ${passwordHash}, ${fullName}, ${username}, 'EMAIL')
    RETURNING id`;
  const userId = rows[0].id as string;
  await sql`INSERT INTO profiles (user_id) VALUES (${userId})`;
  await issueVerification(userId, email, fullName);
  await audit(userId, 'USER_REGISTER', 'user', userId, { email });
  return { message: 'Check your email to verify your GADAVIRAL account.' };
}

export async function resendVerification(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const rows = await sql`
    SELECT id, email, full_name, email_verified FROM users WHERE email = ${email} AND deleted_at IS NULL`;
  if (rows.length === 0) {
    return { message: 'If that account needs verification, a new email has been sent.' };
  }
  const user = rows[0];
  if (user.email_verified) return { message: 'This account is already verified. You can log in.' };

  const last = await sql`
    SELECT created_at FROM email_tokens
    WHERE user_id = ${user.id} AND purpose IN ('VERIFY_EMAIL','OTP_VERIFY')
    ORDER BY created_at DESC LIMIT 1`;
  if (last.length > 0) {
    const ageSec = (Date.now() - new Date(last[0].created_at).getTime()) / 1000;
    if (ageSec < config.emailTokens.resendCooldown) {
      throw ApiError.tooMany(
        `Please wait ${Math.ceil(config.emailTokens.resendCooldown - ageSec)}s before requesting again`,
      );
    }
  }
  await issueVerification(user.id, user.email, user.full_name);
  return { message: 'If that account needs verification, a new email has been sent.' };
}
