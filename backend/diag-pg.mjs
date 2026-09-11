import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('C:/Users/I AM/Documents/Datila/GADAVIRAL/backend/.env', 'utf8');
const m = env.match(/DATABASE_URL=(.*)/);
const url = m[1].trim();

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const q = async (s) => (await c.query(s)).rows;
const users = await q('SELECT COUNT(*)::int AS n FROM users');
const posts = await q('SELECT COUNT(*)::int AS n FROM posts');
const demoUsers = await q('SELECT COUNT(*)::int AS n FROM users WHERE is_demo = true');
const demoPosts = await q('SELECT COUNT(*)::int AS n FROM posts WHERE is_demo = true');
const sample = await q('SELECT username, full_name FROM users WHERE is_demo = true ORDER BY id LIMIT 5');

const out = {
  users: users[0].n,
  posts: posts[0].n,
  demoUsers: demoUsers[0].n,
  demoPosts: demoPosts[0].n,
  sample,
};
fs.writeFileSync('C:/Users/I AM/Documents/Datila/GADAVIRAL/backend/diag-pg-out.json', JSON.stringify(out, null, 2));
await c.end();
console.log('PG-OK ' + JSON.stringify({ users: out.users, posts: out.posts, demoUsers: out.demoUsers, demoPosts: out.demoPosts }));
