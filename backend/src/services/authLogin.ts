import { sql } from '../db/client.js';
import { verifyPassword } from '../utils/crypto.js';
import { ApiError } from '../utils/errors.js';
import { createSession, revokeRefreshToken, type AuthUser } from './tokens.js';
import { audit } from './audit.js';

export interface LoginResult {
  user: AuthUser;
  tokens?: { accessToken: string; refreshToken: string; expiresIn: number };
  needsVerification: boolean;
}

export async function login(
  emailRaw: string,
  password: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const rows = await sql`
    SELECT u.id, u.email, u.username, u.full_name, u.role, u.status, u.email_verified,
           u.auth_provider, u.is_demo, u.password_hash, p.avatar_url
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.email = ${email} AND u.deleted_at IS NULL`;
  const row = rows[0];

  // Constant-ish response regardless of which half failed (§26 enumeration).
  if (!row || !row.password_hash || !verifyPassword(password, row.password_hash)) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (row.status === 'BANNED') throw ApiError.forbidden('This account has been banned');
  if (row.status === 'SUSPENDED') throw ApiError.forbidden('This account is suspended');
  if (row.status === 'DEACTIVATED') throw ApiError.forbidden('Account is deactivated');

  const user: AuthUser = row as AuthUser;
  const tokens = await createSession(user, meta);
  await audit(user.id, 'LOGIN_PASSWORD', 'user', user.id);
  return { user, tokens, needsVerification: !user.email_verified };
}

export async function logout(refreshToken?: string, userId?: string) {
  if (refreshToken) await revokeRefreshToken(refreshToken);
  if (userId) await audit(userId, 'LOGOUT', 'user', userId);
}
