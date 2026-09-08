import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getSql, uniqueEmail } from './helpers.js';
import { hashPassword } from '../src/utils/crypto.js';

const app = createApp();
let sql: any;

async function makeVerifiedUser(name: string): Promise<{ token: string; username: string; id: string }> {
  const email = uniqueEmail(name.replace(/\s+/g, '').toLowerCase());
  const username = (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20)) + '_' + Math.floor(Math.random() * 100000);
  const rows = await sql`
    INSERT INTO users (email, password_hash, full_name, username, email_verified, email_verified_at)
    VALUES (${email}, ${hashPassword('Passw0rd!T')}, ${name}, ${username}, true, now())
    RETURNING id`;
  await sql`INSERT INTO profiles (user_id) VALUES (${rows[0].id})`;
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Passw0rd!T' });
  return { token: login.body.accessToken, username: login.body.user.username, id: rows[0].id };
}

beforeAll(async () => { sql = await getSql(); });

describe('Follows and blocks', () => {
  it('follow: no self-follow, counts update, notification, unfollow', async () => {
    const a = await makeVerifiedUser('Nii Follow Me Quaye');
    const b = await makeVerifiedUser('Naa Follower Ankrah');
    const self = await request(app).post(`/api/v1/users/${a.username}/follow`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(self.status).toBe(400);
    const follow = await request(app).post(`/api/v1/users/${a.username}/follow`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(follow.body.following).toBe(true);
    const prof = await request(app).get(`/api/v1/users/${a.username}`);
    expect(prof.body.user.follower_count).toBe(1);
    const notifs = await request(app).get('/api/v1/notifications')
      .set('Authorization', `Bearer ${a.token}`);
    expect(notifs.body.items.some((n: any) => n.type === 'FOLLOW')).toBe(true);
    await request(app).delete(`/api/v1/users/${a.username}/follow`)
      .set('Authorization', `Bearer ${b.token}`);
  });

  it('block removes mutual follows and hides the blocked author from feeds', async () => {
    const a = await makeVerifiedUser('Naa Blocker Ashong');
    const b = await makeVerifiedUser('Nii Blocked Addo');
    await request(app).post(`/api/v1/users/${b.username}/follow`).set('Authorization', `Bearer ${a.token}`);
    await request(app).post('/api/v1/posts')
      .set('Authorization', `Bearer ${b.token}`).send({ content: 'Post from someone about to be blocked' });
    await request(app).post(`/api/v1/users/${b.username}/block`).set('Authorization', `Bearer ${a.token}`);
    const rel = await request(app).get(`/api/v1/users/${a.username}`);
    expect(rel.body.viewer.following).toBe(false);
    const feed = await request(app).get('/api/v1/posts?feed=recent&limit=50')
      .set('Authorization', `Bearer ${a.token}`);
    const authors = feed.body.items.map((p: any) => p.author_id);
    expect(authors).not.toContain(b.id);
  });
});
