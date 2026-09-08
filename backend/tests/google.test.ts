import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

// Mock the Google OIDC verifier — the LINKING logic is what we test here.
// The real verifier (JWKS signature checks) is exercised in production with
// genuine Google tokens; see docs/testing.md for the manual E2E checklist.
const RUN = Date.now();
vi.mock('../src/services/google.js', () => ({
  verifyGoogleIdToken: vi.fn(async (idToken: string) => {
    const map: Record<string, any> = {
      'new-user-token': { sub: `google-sub-new-${RUN}`, email: `gnew-${RUN}@example.com`, emailVerified: true, name: 'Nii Google Quaye', audience: 'web-client' },
      'returning-token': { sub: `google-sub-return-${RUN}`, email: `greturn-${RUN}@example.com`, emailVerified: true, name: 'Naa Google Ashong', audience: 'android-client' },
      'linker-token': { sub: `google-sub-link-${RUN}`, email: 'glink@example.com', emailVerified: true, name: 'Nii Linker Ankrah', audience: 'desktop-client' },
      'unverified-token': { sub: `google-sub-unv-${RUN}`, email: `gunv-${RUN}@example.com`, emailVerified: false, name: 'Unverified', audience: 'web-client' },
    };
    if (!map[idToken]) throw new Error('Google ID token verification failed: invalid signature');
    return map[idToken];
  }),
  exchangeGoogleCode: vi.fn(),
  buildGoogleAuthUrl: vi.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?mock=1'),
  resolveClientIdType: vi.fn(() => 'WEB'),
}));

import { createApp } from '../src/app.js';
import { getSql, uniqueEmail } from './helpers.js';

const app = createApp();

describe('Google authentication — new, returning, linking, rejection', () => {
  let sql: any;
  beforeAll(async () => { sql = await getSql(); });

  it('new Google user → creates a GADAVIRAL account with verified email + username suggestion', async () => {
    const res = await request(app).post('/api/v1/auth/google/idtoken').send({ idToken: 'new-user-token' });
    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.needsProfileCompletion).toBe(true);
    expect(res.body.user.email).toBe(`gnew-${RUN}@example.com`);
    expect(res.body.user.email_verified).toBe(true);
    expect(res.body.user.username).toMatch(/^nii_google_quaye/);
    expect(res.body.accessToken).toBeTruthy();
    const identities = await sql`SELECT * FROM auth_identities WHERE provider_user_id = ${`google-sub-new-${RUN}`}`;
    expect(identities.length).toBe(1);
  });

  it('same Google identity signs in again — never a duplicate account', async () => {
    const res = await request(app).post('/api/v1/auth/google/idtoken').send({ idToken: 'new-user-token' });
    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(false);
    const count = await sql`SELECT count(*) AS n FROM users WHERE email = ${`gnew-${RUN}@example.com`}`;
    expect(Number(count[0].n)).toBe(1);
  });

  it('existing verified email user + Google → ONE linked account (no duplicate)', async () => {
    const email = uniqueEmail('linkme');
    await request(app).post('/api/v1/auth/register')
      .send({ email: 'glink@example.com', password: 'Passw0rd!x', fullName: 'Nii Linker Ankrah' });
    // (account exists with this email from registration; now Google signs in)
    const res = await request(app).post('/api/v1/auth/google/idtoken').send({ idToken: 'linker-token' });
    expect(res.status).toBe(200);
    expect(res.body.linked).toBe(true);
    const count = await sql`SELECT count(*) AS n FROM users WHERE email = 'glink@example.com'`;
    expect(Number(count[0].n)).toBe(1);
    const u = await sql`SELECT auth_provider, email_verified FROM users WHERE email = 'glink@example.com'`;
    expect(u[0].auth_provider).toBe('LINKED');
    expect(u[0].email_verified).toBe(true);
    const ids = await sql`SELECT * FROM auth_identities WHERE provider_user_id = ${`google-sub-link-${RUN}`}`;
    expect(ids.length).toBe(1);
  });

  it('unverified Google email is rejected', async () => {
    const res = await request(app).post('/api/v1/auth/google/idtoken').send({ idToken: 'unverified-token' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('GOOGLE_EMAIL_UNVERIFIED');
  });

  it('invalid/tampered token is rejected with 401', async () => {
    const res = await request(app).post('/api/v1/auth/google/idtoken').send({ idToken: 'forged-token' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('GOOGLE_TOKEN_INVALID');
    expect(res.body.error.message).toMatch(/Google ID token verification failed/i);
  });

  it('Google registration never grants admin rights', async () => {
    const res = await request(app).post('/api/v1/auth/google/idtoken').send({ idToken: 'returning-token' });
    expect(res.body.user.role).toBe('USER');
  });
});
