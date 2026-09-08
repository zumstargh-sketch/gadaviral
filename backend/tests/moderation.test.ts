import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getSql, uniqueEmail } from './helpers.js';
import { hashPassword } from '../src/utils/crypto.js';
import { moderateSync } from '../src/services/moderation.js';

const app = createApp();
let sql: any;

async function makeVerifiedUser(name: string, role = 'USER'): Promise<{ token: string; username: string; id: string }> {
  const email = uniqueEmail(name.replace(/\s+/g, '').toLowerCase());
  const username = (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20)) + '_' + Math.floor(Math.random() * 100000);
  const rows = await sql`
    INSERT INTO users (email, password_hash, full_name, username, email_verified, email_verified_at, role)
    VALUES (${email}, ${hashPassword('Passw0rd!T')}, ${name}, ${username}, true, now(), ${role})
    RETURNING id`;
  await sql`INSERT INTO profiles (user_id) VALUES (${rows[0].id})`;
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Passw0rd!T' });
  return { token: login.body.accessToken, username: login.body.user.username, id: rows[0].id };
}

beforeAll(async () => { sql = await getSql(); });

describe('Moderation engine (server-side)', () => {
  it('masks profanity but allows the content', () => {
    const r = moderateSync('what the fuck is this');
    expect(r.status).toBe('APPROVED');
    expect(r.sanitized).toContain('f***');
    expect(r.sanitized).not.toContain('fuck');
  });

  it('rejects hate speech outright', () => {
    const r = moderateSync('kill all of them, race war now');
    expect(r.status).toBe('REJECTED');
    expect(r.flags).toContain('hate_speech');
  });

  it('flags spam to the review queue', () => {
    const r = moderateSync('make $ fast! double your money now at bit.ly/xyz bit.ly/abc tinyurl.com/q cutt.ly/w rb.gy/z is.gd/1');
    expect(r.status).toBe('PENDING_REVIEW');
  });

  it('posts with hate speech are rejected at the API', async () => {
    const u = await makeVerifiedUser('Naa Hater Ningo');
    const res = await request(app).post('/api/v1/posts')
      .set('Authorization', `Bearer ${u.token}`)
      .send({ content: 'this contains a slur: faggot' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/community standards/i);
  });

  it('spam posts land in PENDING_REVIEW and appear in the moderation queue', async () => {
    const u = await makeVerifiedUser('Nii Spammer Prampram');
    const res = await request(app).post('/api/v1/posts')
      .set('Authorization', `Bearer ${u.token}`)
      .send({ content: 'You have won free money now claim at tinyurl.com/abc123' });
    expect(res.status).toBe(201);
    expect(res.body.post.status).toBe('PENDING_REVIEW');
    const mod = await makeVerifiedUser('Naa Moderator Osu', 'MODERATOR');
    const queue = await request(app).get('/api/v1/moderation/queue')
      .set('Authorization', `Bearer ${mod.token}`);
    expect(queue.status).toBe(200);
    expect(queue.body.flaggedPosts.some((p: any) => p.id === res.body.post.id)).toBe(true);
  });

  it('reports create real report rows', async () => {
    const u = await makeVerifiedUser('Nii Reporter Ada');
    const target = await makeVerifiedUser('Naa Reported Shai');
    const res = await request(app).post('/api/v1/reports')
      .set('Authorization', `Bearer ${u.token}`)
      .send({ targetType: 'USER', targetId: target.id, category: 'SPAM', details: 'Test report' });
    expect(res.status).toBe(201);
    const row = await sql`SELECT * FROM reports WHERE id = ${res.body.reportId}`;
    expect(row.length).toBe(1);
    expect(row[0].status).toBe('OPEN');
  });
});
