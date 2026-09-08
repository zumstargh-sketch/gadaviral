import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getSql, latestOtpFromOutbox, latestLinkFromOutbox, uniqueEmail } from './helpers.js';

const app = createApp();

describe('Authentication — tokens, reset, email change, logout', () => {
  const password = 'Passw0rd!Test';

  it('refresh rotates the refresh token; reuse revokes the session family', async () => {
    const email = uniqueEmail('refresh');
    await request(app).post('/api/v1/auth/register').send({ email, password, fullName: 'Ref Resher' });
    const otp = await latestOtpFromOutbox(email);
    await request(app).post('/api/v1/auth/verify-otp').send({ email, otp });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const rt = login.body.refreshToken;
    const r1 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: rt });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(rt);
    const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: rt });
    expect(replay.status).toBe(401);
    const afterReuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    expect(afterReuse.status).toBe(401);
  });

  it('password reset: request → single-use link → new password works, old does not', async () => {
    const email = uniqueEmail('reset');
    await request(app).post('/api/v1/auth/register').send({ email, password, fullName: 'Re Setter' });
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email });
    expect(res.status).toBe(200);
    expect(res.body.message).not.toContain(email);
    const token = await latestLinkFromOutbox(email, 'reset');
    const reset = await request(app).post('/api/v1/auth/reset-password')
      .send({ token, password: 'NewPassw0rd!99' });
    expect(reset.status).toBe(200);
    const reuse = await request(app).post('/api/v1/auth/reset-password')
      .send({ token, password: 'AnotherPass1!' });
    expect(reuse.status).toBe(410);
    const oldLogin = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/v1/auth/login').send({ email, password: 'NewPassw0rd!99' });
    expect(newLogin.status).toBe(200);
  });

  it('change email requires current password and confirms via single-use link', async () => {
    const email = uniqueEmail('changer');
    const newEmail = uniqueEmail('renamed');
    await request(app).post('/api/v1/auth/register').send({ email, password, fullName: 'Chain Ger' });
    const otp = await latestOtpFromOutbox(email);
    await request(app).post('/api/v1/auth/verify-otp').send({ email, otp });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const bad = await request(app).post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ newEmail, currentPassword: 'WrongPassword1' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ newEmail, currentPassword: password });
    expect(ok.status).toBe(200);
    const token = await latestLinkFromOutbox(newEmail, 'confirm');
    const confirm = await request(app).get(`/api/v1/auth/confirm-email?token=${token}`)
      .set('Accept', 'application/json');
    expect(confirm.status).toBe(200);
    const relogin = await request(app).post('/api/v1/auth/login').send({ email: newEmail, password });
    expect(relogin.status).toBe(200);
  });

  it('logout revokes the refresh token', async () => {
    const email = uniqueEmail('bye');
    await request(app).post('/api/v1/auth/register').send({ email, password, fullName: 'Bye Now' });
    const otp = await latestOtpFromOutbox(email);
    await request(app).post('/api/v1/auth/verify-otp').send({ email, otp });
    const l = await request(app).post('/api/v1/auth/login').send({ email, password });
    const out = await request(app).post('/api/v1/auth/logout').send({ refreshToken: l.body.refreshToken });
    expect(out.status).toBe(200);
    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: l.body.refreshToken });
    expect(reuse.status).toBe(401);
  });

  it('change email requires current password and confirms via single-use link', async () => {
    const email = uniqueEmail('changer2');
    const newEmail = uniqueEmail('renamed2');
    await request(app).post('/api/v1/auth/register').send({ email, password, fullName: 'Chain Ger Two' });
    const otp = await latestOtpFromOutbox(email);
    await request(app).post('/api/v1/auth/verify-otp').send({ email, otp });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    const bad = await request(app).post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ newEmail, currentPassword: 'WrongPassword1' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ newEmail, currentPassword: password });
    if (ok.status !== 200) console.error('change-email body:', JSON.stringify(ok.body));
    expect(ok.status).toBe(200);
    const token = await latestLinkFromOutbox(newEmail, 'confirm');
    expect(token).toBeTruthy();
    const confirm = await request(app).get(`/api/v1/auth/confirm-email?token=${token}`)
      .set('Accept', 'application/json');
    expect(confirm.status).toBe(200);
    const relogin = await request(app).post('/api/v1/auth/login').send({ email: newEmail, password });
    expect(relogin.status).toBe(200);
  });
});
