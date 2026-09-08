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

describe('Social features — posts, reactions, comments, shares', () => {
  let alice: any, bob: any, postId: string;

  beforeAll(async () => {
    alice = await makeVerifiedUser('Nii Poster Laryea');
    bob = await makeVerifiedUser('Naa Reactor Odoi');
  });

  it('creates a post (real row, visible in feed)', async () => {
    const res = await request(app).post('/api/v1/posts')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ content: 'Testing the new GADAVIRAL feed with a real post.', type: 'TEXT' });
    expect(res.status).toBe(201);
    postId = res.body.post.id;
    const feed = await request(app).get('/api/v1/posts?feed=recent&limit=10');
    const ids = feed.body.items.map((p: any) => p.id);
    expect(ids).toContain(postId);
  });

  it('reacts once — duplicate same-type reaction does not double-count', async () => {
    const r1 = await request(app).put(`/api/v1/posts/${postId}/react`)
      .set('Authorization', `Bearer ${bob.token}`).send({ type: 'LOVE' });
    expect(r1.status).toBe(200);
    const r2 = await request(app).put(`/api/v1/posts/${postId}/react`)
      .set('Authorization', `Bearer ${bob.token}`).send({ type: 'LOVE' });
    expect(r2.body.changed).toBe(false);
    const detail = await request(app).get(`/api/v1/posts/${postId}`);
    expect(detail.body.post.reaction_count).toBe(1);
    const list = await request(app).get(`/api/v1/posts/${postId}/reactions`);
    expect(list.body.items.length).toBe(1);
  });

  it('changes reaction type and removes it', async () => {
    await request(app).put(`/api/v1/posts/${postId}/react`)
      .set('Authorization', `Bearer ${bob.token}`).send({ type: 'PROUD' });
    const detail = await request(app).get(`/api/v1/posts/${postId}`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(detail.body.post.viewer.reaction).toBe('PROUD');
    expect(detail.body.post.reaction_count).toBe(1);
    await request(app).delete(`/api/v1/posts/${postId}/react`)
      .set('Authorization', `Bearer ${bob.token}`);
    const after = await request(app).get(`/api/v1/posts/${postId}`);
    expect(after.body.post.reaction_count).toBe(0);
  });

  it('comments and replies are real rows; author gets a notification', async () => {
    const c = await request(app).post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${bob.token}`).send({ content: 'Feature works — nice one!' });
    expect(c.status).toBe(201);
    const reply = await request(app).post(`/api/v1/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ content: 'Reply test passed.', parentCommentId: c.body.comment.id });
    expect(reply.status).toBe(201);
    const list = await request(app).get(`/api/v1/posts/${postId}/comments`);
    expect(list.body.items.length).toBe(1);
    expect(String(list.body.items[0].reply_count)).toBe('1');
    const notifs = await request(app).get('/api/v1/notifications')
      .set('Authorization', `Bearer ${alice.token}`);
    expect(notifs.body.items.some((n: any) => n.type === 'COMMENT')).toBe(true);
  });

  it('shares once per target — duplicate share is rejected (409)', async () => {
    const s1 = await request(app).post(`/api/v1/posts/${postId}/share`)
      .set('Authorization', `Bearer ${bob.token}`).send({ caption: 'Sharing this test' });
    expect(s1.status).toBe(201);
    const s2 = await request(app).post(`/api/v1/posts/${postId}/share`)
      .set('Authorization', `Bearer ${bob.token}`).send({ caption: 'Again' });
    expect(s2.status).toBe(409);
    const detail = await request(app).get(`/api/v1/posts/${postId}`);
    expect(detail.body.post.share_count).toBe(1);
  });

  it('edit own post; delete own post', async () => {
    const edit = await request(app).patch(`/api/v1/posts/${postId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ content: 'Edited content for the feed test.' });
    expect(edit.status).toBe(200);
    const del = await request(app).delete(`/api/v1/posts/${postId}`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(del.status).toBe(200);
  });
});
