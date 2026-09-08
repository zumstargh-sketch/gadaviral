import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getSql } from './helpers.js';
import { hashPassword } from '../src/utils/crypto.js';
import { seedDemo } from '../seeds/demoManager.js';
import { wipeDemoData } from '../seeds/demoWipe.js';
import { verifyDemoData } from '../seeds/verifyApi.js';

const app = createApp();
let sql: any;

beforeAll(async () => { sql = await getSql(); });

describe('Demo data system — seed, verify, wipe, real-data safety (§85-86, §98, §101)', () => {
  let realUserEmail = '';

  it('seeds the full demo dataset into the test database', async () => {
    const report = await seedDemo({ force: true });
    expect(report.users).toBe(117);
    expect(report.posts).toBe(150);
    expect(report.follows).toBeGreaterThan(1000);
  }, 300_000);

  it('passes every automated demo-data validation rule (§98)', async () => {
    const result = await verifyDemoData();
    const failures = result.issues.filter((i) => !i.ok);
    if (failures.length > 0) console.error(failures);
    expect(result.ok).toBe(true);
  }, 120_000);

  it('DELETE ALL DEMO DATA removes demo rows but NEVER real users', async () => {
    // Create a genuine production-style user first
    realUserEmail = `real-user-${Date.now()}@prod.gadaviral.dev`;
    await sql`
      INSERT INTO users (email, password_hash, full_name, username, email_verified, email_verified_at)
      VALUES (${realUserEmail}, ${hashPassword('RealPassw0rd!')}, 'Real Ga User', ${'real_user_' + Date.now().toString(36)}, true, now())`;
    const realPost = await sql`
      INSERT INTO posts (author_id, type, content, status, is_demo)
      SELECT id, 'TEXT', 'A genuine post by a real user', 'ACTIVE', false
      FROM users WHERE email = ${realUserEmail} RETURNING id`;

    const counts = await wipeDemoData();
    expect(counts.users).toBe(117);

    const demoLeft = await sql`SELECT count(*) AS n FROM users WHERE is_demo = true`;
    expect(Number(demoLeft[0].n)).toBe(0);
    const demoPosts = await sql`SELECT count(*) AS n FROM posts WHERE is_demo = true`;
    expect(Number(demoPosts[0].n)).toBe(0);
    const demoNotifs = await sql`SELECT count(*) AS n FROM notifications WHERE is_demo = true`;
    expect(Number(demoNotifs[0].n)).toBe(0);
    const demoFollows = await sql`SELECT count(*) AS n FROM follows WHERE is_demo = true`;
    expect(Number(demoFollows[0].n)).toBe(0);

    // Real data untouched
    const real = await sql`SELECT email FROM users WHERE email = ${realUserEmail}`;
    expect(real.length).toBe(1);
    const keptPost = await sql`SELECT id, status FROM posts WHERE id = ${realPost[0].id}`;
    expect(keptPost.length).toBe(1);
    expect(keptPost[0].status).toBe('ACTIVE');
  }, 180_000);

  it('REGENERATE works after a wipe with no uncontrolled duplicates', async () => {
    const r1 = await seedDemo({ force: true });
    expect(r1.users).toBe(117);
    expect(r1.posts).toBe(150);
    const r2 = await seedDemo({ force: true });
    expect(r2.users).toBe(117);
    expect(r2.posts).toBe(150);
    const total = await sql`SELECT count(*) AS n FROM users WHERE is_demo = true`;
    expect(Number(total[0].n)).toBe(117); // exactly one live batch, never doubled
  }, 600_000);

  it('demo user cannot be confused with real users (identifiable tagging)', async () => {
    const allDemo = await sql`SELECT count(*) AS n FROM users WHERE is_demo = true AND demo_source = 'seed-demo'`;
    expect(Number(allDemo[0].n)).toBe(117);
  });

  afterAll(async () => {
    // Leave the test DB clean of demo data for other suites
    await wipeDemoData();
  });
});
