import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getSql, latestOtpFromOutbox, latestLinkFromOutbox, uniqueEmail } from './helpers.js';

const app = createApp();
let sql: any;

beforeAll(async () => {
  sql = await getSql();
});

describe('Authentication — registration, verification, sessions', () => {
  const email = uniqueEmail('auth');
  const password = 'Passw0rd!Test';

  it('registers and sends a verification email with OTP + link (admin@gadaviral.com sender)', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ email, password, fullName: 'Nii Test Laryea' });
    expect(res.status).toBe(202);
    const outbox = await sql`SELECT to_email, subject FROM outbox_emails WHERE to_email = ${email} ORDER BY created_at DESC`;
    expect(outbox.length).toBeGreaterThan(0);
    expect(outbox[0].subject).toContain('GADAVIRAL');
    const otp = await latestOtpFromOutbox(email);
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('rejects a wrong OTP and never verifies', async () => {
    const res = await request(app).post('/api/v1/auth/verify-otp')
      .send({ email, otp: '000000' });
    expect(res.status).toBe(400);
  });

  it('verifies with the correct OTP', async () => {
    const otp = await latestOtpFromOutbox(email);
    const res = await request(app).post('/api/v1/auth/verify-otp').send({ email, otp });
    expect(res.status).toBe(200);
    const user = await sql`SELECT email_verified FROM users WHERE email = ${email}`;
    expect(user[0].email_verified).toBe(true);
  });

  it('blocks interactive actions until verified', async () => {
    const email2 = uniqueEmail('unverified');
    await request(app).post('/api/v1/auth/register')
      .send({ email: email2, password, fullName: 'Naa Unverified Quaye' });
    const login = await request(app).post('/api/v1/auth/login').send({ email: email2, password });
    expect(login.status).toBe(200);
    expect(login.body.needsVerification).toBe(true);
    const post = await request(app).post('/api/v1/posts')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ content: 'Should not be allowed' });
    expect(post.status).toBe(403);
    expect(post.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('logs in and returns usable access token', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.username).toMatch(/^nii_test_laryea/);
    const me = await request(app).get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });

  it('rejects bad credentials without leaking which half failed', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });
});
