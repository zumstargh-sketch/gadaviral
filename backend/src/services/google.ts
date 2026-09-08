import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';

/**
 * Genuine Google OpenID Connect verification.
 * ID tokens are verified against Google's public JWKS: signature, expiry,
 * issuer and audience (per-platform client IDs). The stable `sub` claim is
 * returned as the provider user id. Frontend-supplied profile data is never
 * trusted directly.
 */

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(JWKS_URL));
  return jwks;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
  locale?: string;
  audience: string;
}

export async function verifyGoogleIdToken(
  idToken: string,
  opts: { expectedAudience?: string } = {},
): Promise<GoogleIdentity> {
  const audiences = opts.expectedAudience ? [opts.expectedAudience] : config.google.audiences;
  if (audiences.length === 0) {
    throw new Error('Google authentication is not configured (missing client IDs)');
  }
  let lastError: unknown = null;
  for (const audience of audiences) {
    try {
      const { payload } = await jwtVerify(idToken, getJwks(), {
        issuer: GOOGLE_ISSUERS,
        audience,
        clockTolerance: 5,
      });
      if (!payload.sub) throw new Error('Token missing subject');
      const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
      if (!payload.email) throw new Error('Token missing email claim');
      return {
        sub: String(payload.sub),
        email: String(payload.email),
        emailVerified,
        name: String(payload.name ?? String(payload.email).split('@')[0]),
        picture: payload.picture ? String(payload.picture) : undefined,
        locale: payload.locale ? String(payload.locale) : undefined,
        audience,
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `Google ID token verification failed: ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
  );
}

/** Build the Google authorization-code URL for the web flow. */
export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account',
  });
  if (config.google.hd) params.set('hd', config.google.hd);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
  id_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
}

/** Exchange an authorization code for tokens (server-to-server). */
export async function exchangeGoogleCode(code: string): Promise<GoogleIdentity> {
  if (!config.google.clientId || !config.google.clientSecret) {
    throw new Error('Google OAuth client is not configured');
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.callbackUrl,
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || !data.id_token) {
    throw new Error(`Google code exchange failed: ${data.error ?? res.status}`);
  }
  // Code flow tokens come from Google's token endpoint directly over TLS;
  // we still verify the ID token signature/claims for defence in depth.
  return verifyGoogleIdToken(data.id_token, { expectedAudience: config.google.clientId });
}

/** Which platform client an ID token was issued for (for analytics/security). */
export function resolveClientIdType(audience: string): 'WEB' | 'ANDROID' | 'DESKTOP' {
  if (audience === config.google.androidClientId) return 'ANDROID';
  if (audience === config.google.desktopClientId) return 'DESKTOP';
  return 'WEB';
}
