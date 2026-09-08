import { SignJWT, jwtVerify } from 'jose';
import { sql } from '../db/client.js';
import { config } from '../config.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { ApiError } from '../utils/errors.js';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED';
  email_verified: boolean;
  auth_provider: string;
  is_demo: boolean;
  avatar_url?: string | null;
}

const secretKey = () => new TextEncoder().encode(config.jwt.accessSecret);

export async function signAccessToken(user: { id: string; role: string; status: string; is_demo: boolean }) {
  return new SignJWT({ role: user.role, status: user.status, demo: user.is_demo })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer('gadaviral')
    .setAudience('gadaviral-clients')
    .setIssuedAt()
    .setExpirationTime(`${config.jwt.accessTtl}s`)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<{ sub: string; role: string }> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: 'gadaviral',
      audience: 'gadaviral-clients',
    });
    return { sub: String(payload.sub), role: String(payload.role ?? 'USER') };
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
}

/** Load the current user row for a JWT subject; rejects suspended/banned accounts. */
export async function loadAuthUser(userId: string): Promise<AuthUser> {
  const rows = await sql`
    SELECT u.id, u.email, u.username, u.full_name, u.role, u.status, u.email_verified,
           u.auth_provider, u.is_demo, p.avatar_url
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.id = ${userId} AND u.deleted_at IS NULL`;
  const user = rows[0] as AuthUser;
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.status === 'BANNED') throw ApiError.forbidden('This account has been banned', { code: 'ACCOUNT_BANNED' });
  if (user.status === 'SUSPENDED') throw ApiError.forbidden('This account is suspended', { code: 'ACCOUNT_SUSPENDED' });
  if (user.status === 'DEACTIVATED') throw ApiError.forbidden('Account is deactivated', { code: 'ACCOUNT_DEACTIVATED' });
  return user;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function issueRefreshToken(
  userId: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<string> {
  const token = randomToken(48);
  const expires = new Date(Date.now() + config.jwt.refreshTtl * 1000);
  await sql`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
    VALUES (${userId}, ${sha256(token)}, ${expires}, ${meta.userAgent ?? null}, ${meta.ip ?? null})`;
  return token;
}

/** Validate + rotate a refresh token (single use; replay revokes the whole family). */
export async function rotateRefreshToken(token: string, meta: { userAgent?: string; ip?: string } = {}) {
  const hash = sha256(token);
  const rows = await sql`
    SELECT rt.*, u.status FROM refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.token_hash = ${hash}`;
  const row = rows[0];
  if (!row) throw ApiError.unauthorized('Invalid refresh token');
  if (row.revoked_at) {
    // Possible token replay/theft — revoke all sessions for this user.
    await sql`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = ${row.user_id} AND revoked_at IS NULL`;
    throw ApiError.unauthorized('Refresh token reused — all sessions revoked');
  }
  if (row.status !== 'ACTIVE') throw ApiError.forbidden('Account is not active');
  if (new Date(row.expires_at) < new Date()) throw ApiError.unauthorized('Refresh token expired');

  const newToken = await issueRefreshToken(row.user_id, meta);
  await sql`
    UPDATE refresh_tokens SET revoked_at = now()
    WHERE id = ${row.id}`;
  return { userId: row.user_id as string, refreshToken: newToken };
}

export async function revokeRefreshToken(token: string) {
  await sql`
    UPDATE refresh_tokens SET revoked_at = now()
    WHERE token_hash = ${sha256(token)} AND revoked_at IS NULL`;
}

export async function revokeAllSessions(userId: string) {
  await sql`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`;
}

export async function createSession(user: AuthUser, meta: { userAgent?: string; ip?: string } = {}) {
  const accessToken = await signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id, meta);
  await sql`UPDATE users SET last_login_at = now() WHERE id = ${user.id}`;
  return { accessToken, refreshToken, expiresIn: config.jwt.accessTtl };
}
