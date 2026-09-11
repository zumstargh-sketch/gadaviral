import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('C:/Users/I AM/Documents/Datila/GADAVIRAL/backend/.env', 'utf8');
const url = env.match(/DATABASE_URL=(.*)/)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const cols = await c.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('users','posts','comments','reactions','follows','polls','poll_options','notifications')
  ORDER BY table_name, ordinal_position
`);
const byTable = {};
for (const r of cols.rows) {
  (byTable[r.table_name] ||= []).push(`${r.column_name}:${r.data_type}`);
}
const out = { schema: byTable };

const demoUserCols = (byTable.users || []).map((s) => s.split(':')[0]);
out.demoUserSample = (await c.query(`SELECT ${demoUserCols.join(', ')} FROM users WHERE is_demo = true ORDER BY id LIMIT 2`)).rows;
out.demoPostSample = (await c.query("SELECT id, author_id, type, visibility, LEFT(content, 120) AS content_head, is_demo, created_at FROM posts WHERE is_demo = true ORDER BY id LIMIT 3")).rows;
out.pollSample = (await c.query("SELECT id, author_id, type, LEFT(content, 80) AS content_head FROM posts WHERE is_demo = true AND type = 'POLL' ORDER BY id LIMIT 2")).rows;
out.counts = {
  comments: (await c.query('SELECT COUNT(*)::int AS n FROM comments')).rows[0].n,
  reactions: (await c.query('SELECT COUNT(*)::int AS n FROM reactions')).rows[0].n,
  follows: (await c.query('SELECT COUNT(*)::int AS n FROM follows')).rows[0].n,
  polls: (await c.query("SELECT COUNT(*)::int AS n FROM posts WHERE is_demo = true AND type = 'POLL'")).rows[0].n,
};
fs.writeFileSync('C:/Users/I AM/Documents/Datila/GADAVIRAL/backend/diag-pg-schema.json', JSON.stringify(out, null, 2));
await c.end();
console.log('SCHEMA-OK');
