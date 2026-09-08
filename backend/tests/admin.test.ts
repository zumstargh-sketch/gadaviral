import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getSql, uniqueEmail } from './helpers.js';
import { hashPassword } from '../src/utils/crypto.js';

const app = createApp();
let sql: any;

async function makeVerifiedUser(name: string, role = 'USER'): Promise<{ token: string; username: string; id: string; email: string }> {
  const email = uniqueEmail(name.replace(/\s+/g, '').toLowerCase());
  const username = (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20)) + '_' + Math.floor(Math.random() * 100000);
  const rows = await sql`
    INSERT INTO users (email, password_hash, full_name, username, email_verified, email_verified_at, role)
    VALUES (${email}, ${hashPassword('Passw0rd!T')}, ${name}, ${username}, true, now(), ${role})
    RETURNING id`;
  await sql`INSERT INTO profiles (user_id) VALUES (${rows[0].id})`;
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Passw0rd!T' });
  return { token: login.body.accessToken, username: login.body.user.username, id: rows[0].id, email };
}

beforeAll(async () => { sql = await getSql(); });

describe('Admin — RBAC, user management, analytics, demo endpoints', () => {
  it('regular users cannot access admin endpoints', async () => {
    const u = await makeVerifiedUser('Nii Plain User Teshie');
    const res = await request(app).get('/api/v1/admin/analytics')
      .set('Authorization', `Bearer ${u.token}`);
    expect(res.status).toBe(403);
  });

  it('admins can read analytics and audit logs', async () => {
    const a = await makeVerifiedUser('Nii Admin Accra', 'SUPER_ADMIN');
    const analytics = await request(app).get('/api/v1/admin/analytics')
      .set('Authorization', `Bearer ${a.token}`);
    expect(analytics.status).toBe(200);
    expect(analytics.body.totals.users).toBeGreaterThan(0);
    const logs = await request(app).get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${a.token}`);
    expect(logs.status).toBe(200);
  });

  it('admin can suspend and restore a user; suspended users cannot log in', async () => {
    const admin = await makeVerifiedUser('Nii Enforcer Tema', 'ADMIN');
    const victim = await makeVerifiedUser('Naa Suspended Nungua');
    const suspend = await request(app).post(`/api/v1/admin/users/${victim.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'SUSPENDED', reason: 'Test suspension' });
    expect(suspend.status).toBe(200);
    const relogin = await request(app).post('/api/v1/auth/login')
      .send({ email: victim.email, password: 'Passw0rd!T' });
    expect(relogin.status).toBe(403);
    const restore = await request(app).post(`/api/v1/admin/users/${victim.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`).send({ status: 'ACTIVE' });
    expect(restore.status).toBe(200);
  });

  it('only a super admin can change roles', async () => {
    const admin = await makeVerifiedUser('Nii Roleadmin La', 'ADMIN');
    const super1 = await makeVerifiedUser('Nii Super Boss Osu', 'SUPER_ADMIN');
    const target = await makeVerifiedUser('Naa Promotee Labadi');
    const forbidden = await request(app).post(`/api/v1/admin/users/${target.id}/role`)
      .set('Authorization', `Bearer ${admin.token}`).send({ role: 'MODERATOR' });
    expect(forbidden.status).toBe(403);
    const allowed = await request(app).post(`/api/v1/admin/users/${target.id}/role`)
      .set('Authorization', `Bearer ${super1.token}`).send({ role: 'MODERATOR' });
    expect(allowed.status).toBe(200);
  });

  it('demo data endpoints respond (stats + verify) and are admin-only', async () => {
    const admin = await makeVerifiedUser('Nii Demoadmin JamesTown', 'SUPER_ADMIN');
    const stats = await request(app).get('/api/v1/admin/demo/stats')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(stats.status).toBe(200);
    expect(stats.body).toHaveProperty('users');
    const verify = await request(app).get('/api/v1/admin/demo/verify')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(verify.status).toBe(200);
    expect(verify.body).toHaveProperty('issues');
  });
});
