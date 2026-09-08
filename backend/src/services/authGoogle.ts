import { sql } from '../db/client.js';
import { config } from '../config.js';
import { ApiError } from '../utils/errors.js';
import { audit } from './audit.js';
import { suggestUsername, slugifyUsername } from './authCore.js';
import {
  verifyGoogleIdToken, exchangeGoogleCode, buildGoogleAuthUrl, type GoogleIdentity,
} from './google.js';
import { createSession, type AuthUser } from './tokens.js';
import { mirrorGooglePicture } from './authGooglePicture.js';

export interface GoogleAuthResult {
  user: AuthUser;
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
  isNewUser: boolean;
  linked: boolean;
  needsProfileCompletion: boolean;
}

async function loadAuthUserById(userId: string): Promise<AuthUser> {
  const rows = await sql`
    SELECT u.id, u.email, u.username, u.full_name, u.role, u.status, u.email_verified,
           u.auth_provider, u.is_demo, p.avatar_url
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.id = ${userId}`;
  return rows[0] as AuthUser;
}

async function attachGoogleIdentity(userId: string, identity: GoogleIdentity) {
  await sql`
    INSERT INTO auth_identities (user_id, provider, provider_user_id, provider_email, provider_name, provider_picture)
    VALUES (${userId}, 'GOOGLE', ${identity.sub}, ${identity.email}, ${identity.name}, ${identity.picture ?? null})
    ON CONFLICT (provider, provider_user_id) DO UPDATE
      SET provider_email = EXCLUDED.provider_email,
          provider_name = EXCLUDED.provider_name,
          provider_picture = EXCLUDED.provider_picture,
          updated_at = now()`;
}

/** Web authorization-code flow entry points. */
export function googleAuthUrl(state: string): string {
  if (!config.google.clientId) throw ApiError.badRequest('Google login is not configured');
  return buildGoogleAuthUrl(state);
}

export async function googleCallback(code: string, meta: { ip?: string; userAgent?: string }) {
  const identity = await exchangeGoogleCode(code);
  return googleSignIn(identity, meta);
}

/** Android / Windows / Web ID-token flow (spec §15/§16). */
export async function googleIdTokenSignIn(idToken: string, meta: { ip?: string; userAgent?: string }) {
  let identity: GoogleIdentity;
  try {
    identity = await verifyGoogleIdToken(idToken);
  } catch (e: any) {
    throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', e?.message ?? 'Google ID token verification failed');
  }
  return googleSignIn(identity, meta);
}


/**
 * Core Google → GADAVIRAL linking logic (§9):
 *  1. Existing Google identity → direct login.
 *  2. Existing GADAVIRAL account with same VERIFIED email → link identities (one account).
 *  3. Otherwise → create a new account in "profile completion" state.
 */
export async function googleSignIn(
  identity: GoogleIdentity,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<GoogleAuthResult> {
  if (!identity.emailVerified) {
    throw new ApiError(403, 'GOOGLE_EMAIL_UNVERIFIED',
      'Your Google account email is not verified. Verify it with Google first, then try again.');
  }
  if (config.google.hd && !identity.email.endsWith(`@${config.google.hd}`)) {
    throw ApiError.forbidden('This Google account domain is not permitted');
  }

  // 1. Existing linked identity?
  const linked = await sql`
    SELECT user_id FROM auth_identities
    WHERE provider = 'GOOGLE' AND provider_user_id = ${identity.sub}`;
  if (linked.length > 0) {
    const userId = linked[0].user_id as string;
    await attachGoogleIdentity(userId, identity);
    const user = await loadAuthUserById(userId);
    const tokens = await createSession(user, meta);
    await audit(userId, 'LOGIN_GOOGLE', 'user', userId);
    return { user, tokens, isNewUser: false, linked: false, needsProfileCompletion: !user.email_verified };
  }

  // 2. Existing GADAVIRAL account with the same verified email → secure account linking.
  const byEmail = await sql`
    SELECT id, email_verified FROM users WHERE email = ${identity.email} AND deleted_at IS NULL`;
  if (byEmail.length > 0) {
    const existing = byEmail[0];
    if (!existing.email_verified) {
      // The Google identity itself is verified over OIDC, so the link is safe to
      // complete and the account's email can be marked verified.
      await sql`
        UPDATE users SET email_verified = true, email_verified_at = now() WHERE id = ${existing.id}`;
    }
    await attachGoogleIdentity(existing.id, identity);
    await sql`
      UPDATE users SET auth_provider = 'LINKED' WHERE id = ${existing.id} AND auth_provider = 'EMAIL'`;
    const user = await loadAuthUserById(existing.id);
    const tokens = await createSession(user, meta);
    await audit(existing.id, 'GOOGLE_ACCOUNT_LINKED', 'user', existing.id, { sub: identity.sub });
    return { user, tokens, isNewUser: false, linked: true, needsProfileCompletion: false };
  }

  // 3. Brand-new user → create the GADAVIRAL account from the verified identity.
  const displayName = identity.name?.trim() || identity.email.split('@')[0];
  const username = await suggestUsername(slugifyUsername(displayName) || displayName);
  const created = await sql`
    INSERT INTO users (email, password_hash, full_name, username, auth_provider, email_verified, email_verified_at)
    VALUES (${identity.email}, NULL, ${displayName}, ${username}, 'GOOGLE', true, now())
    RETURNING id`;
  const userId = created[0].id as string;
  const avatarUrl = await mirrorGooglePicture(identity.picture, userId);
  await sql`
    INSERT INTO profiles (user_id, avatar_url) VALUES (${userId}, ${avatarUrl})`;
  await attachGoogleIdentity(userId, identity);
  const user = await loadAuthUserById(userId);
  const tokens = await createSession(user, meta);
  await audit(userId, 'REGISTER_GOOGLE', 'user', userId, { sub: identity.sub });
  return { user, tokens, isNewUser: true, linked: false, needsProfileCompletion: true };
}
