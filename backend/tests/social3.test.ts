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

describe('Polls, messaging, groups, events, search', () => {
  it('poll: real votes; single-choice revote replaces the vote', async () => {
    const alice = await makeVerifiedUser('Nii Poller Lamptey');
    const bob = await makeVerifiedUser('Naa Voter Tackie');
    const poll = await request(app).post('/api/v1/posts')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        type: 'POLL', content: 'Testing polls: which food reminds you most of home?',
        poll: { question: 'Which food reminds you most of home?', options: ['Kenkey & fish', 'Banku & okro', 'Abolo'] },
      });
    expect(poll.status).toBe(201);
    expect(poll.body.post.poll.options.length).toBe(3);
    const [o1, o2] = poll.body.post.poll.options;
    await request(app).post(`/api/v1/posts/${poll.body.post.id}/vote`)
      .set('Authorization', `Bearer ${bob.token}`).send({ optionId: o1.id });
    const v2 = await request(app).post(`/api/v1/posts/${poll.body.post.id}/vote`)
      .set('Authorization', `Bearer ${bob.token}`).send({ optionId: o2.id });
    expect(Number(v2.body.options.find((o: any) => o.id === o1.id).votes)).toBe(0);
    expect(Number(v2.body.options.find((o: any) => o.id === o2.id).votes)).toBe(1);
  });

  it('messaging: start conversation, send, inbox shows the thread', async () => {
    const a = await makeVerifiedUser('Nii Sender Martey');
    const b = await makeVerifiedUser('Naa Receiver Ayeh');
    const conv = await request(app).post('/api/v1/messages/conversations')
      .set('Authorization', `Bearer ${a.token}`).send({ username: b.username });
    expect(conv.status).toBe(201);
    const send = await request(app).post(`/api/v1/messages/conversations/${conv.body.conversationId}`)
      .set('Authorization', `Bearer ${a.token}`).send({ content: 'Hello from the integration test!' });
    expect(send.status).toBe(201);
    const inbox = await request(app).get('/api/v1/messages/conversations')
      .set('Authorization', `Bearer ${b.token}`);
    expect(inbox.body.items.length).toBeGreaterThan(0);
  });

  it('groups and events: create, join, rsvp', async () => {
    const a = await makeVerifiedUser('Nii Groupman Dodoo');
    const g = await request(app).post('/api/v1/groups')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ name: 'Test Ga Heritage Circle', description: 'Test group for integration' });
    expect(g.status).toBe(201);
    const join = await request(app).post(`/api/v1/groups/${g.body.group.slug}/join`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(join.body.joined).toBe(true);
    const ev = await request(app).post('/api/v1/events')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        title: 'Integration Test Meetup', startsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        location: 'Accra', description: 'Test event',
      });
    expect(ev.status).toBe(201);
    const rsvp = await request(app).post(`/api/v1/events/${ev.body.event.slug}/rsvp`)
      .set('Authorization', `Bearer ${a.token}`).send({ rsvp: 'GOING' });
    expect(rsvp.body.rsvp).toBe('GOING');
  });

  it('search endpoint responds with all buckets', async () => {
    const s = await request(app).get('/api/v1/search?q=homowo');
    expect(s.status).toBe(200);
    expect(Array.isArray(s.body.posts)).toBe(true);
    expect(Array.isArray(s.body.users)).toBe(true);
  });
});
