import { sql } from '../src/db/client.js';
import fs from 'node:fs';

// Re-apply the counter helper functions from migration 002a (live hotfix).
const content = fs.readFileSync('migrations/002_social_a.sql', 'utf8');
const fns = content.split('-- 002a: counter helpers + posts + post_media')[1]
  .split('CREATE TABLE')[0];
await sql.unsafe(fns);
console.log('counter functions updated');
const users = await sql`SELECT id FROM users LIMIT 2`;
await sql`INSERT INTO follows (follower_id, followee_id) VALUES (${users[0].id}, ${users[1].id})`;
console.log('probe follow insert OK');
const after = await sql`SELECT id, follower_count, following_count FROM users WHERE id IN (${users[0].id}, ${users[1].id})`;
console.log(after);
await sql`DELETE FROM follows WHERE follower_id = ${users[0].id} AND followee_id = ${users[1].id}`;
console.log('probe cleaned up');
await sql.end();
