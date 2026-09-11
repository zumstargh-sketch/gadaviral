/**
 * Export GADAVIRAL demo data from the legacy Render PostgreSQL into the JSON
 * files scripts/wp_importer_runner.php consumes (scripts/exports/).
 * Demo-only, additive, no writes to PostgreSQL. Run: node export-demo-to-wp.mjs
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const root = 'C:/Users/I AM/Documents/Datila/GADAVIRAL';
const env = fs.readFileSync(path.join(root, 'backend/.env'), 'utf8');
const url = env.match(/DATABASE_URL=(.*)/)[1].trim();
const outDir = path.join(root, 'scripts/exports');
fs.mkdirSync(outDir, { recursive: true });

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const write = (name, rows) => {
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(rows, null, 1));
  console.log(`${name}: ${rows.length}`);
};

// Users (demo only) — runner expects {id, username, email, full_name, is_demo}
const users = (await c.query(`
  SELECT id, username, email, full_name, true AS is_demo
  FROM users WHERE is_demo = true AND deleted_at IS NULL ORDER BY created_at
`)).rows;
write('users.json', users);

// Posts (demo only) — {id, content, author_id, type, created_at}
// Media is skipped: the original asset URLs pointed at the retired Render
// storage, so text-only import keeps the feed clean.
const posts = (await c.query(`
  SELECT id, author_id, type, COALESCE(NULLIF(content, ''), 'Dangme & Ga Online Social Community') AS content,
         to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
  FROM posts WHERE is_demo = true AND deleted_at IS NULL ORDER BY created_at
`)).rows;
write('posts.json', posts);

const postIds = new Set(posts.map((p) => p.id));

// Comments on demo posts by demo authors — {id, post_id, author_id, author_name, content}
const comments = (await c.query(`
  SELECT c.id, c.post_id, c.author_id, u.full_name AS author_name, c.content
  FROM comments c JOIN users u ON u.id = c.author_id
  WHERE c.is_demo = true
    AND c.status = 'ACTIVE'
  ORDER BY c.created_at
`)).rows.filter((row) => postIds.has(row.post_id));
write('comments.json', comments);

// Reactions — {id, post_id, user_id, type, created_at}
const reactions = (await c.query(`
  SELECT id, post_id, user_id, type, to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
  FROM reactions WHERE is_demo = true ORDER BY created_at
`)).rows.filter((row) => postIds.has(row.post_id));
write('reactions.json', reactions);

// Follows — {follower_id, followee_id, created_at}
const userIds = new Set(users.map((u) => u.id));
const follows = (await c.query(`
  SELECT follower_id, followee_id, to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
  FROM follows WHERE is_demo = true ORDER BY created_at
`)).rows.filter((row) => userIds.has(row.follower_id) && userIds.has(row.followee_id));
write('follows.json', follows);

await c.end();
console.log(`EXPORT-OK users=${users.length} posts=${posts.length} comments=${comments.length} reactions=${reactions.length} follows=${follows.length}`);
