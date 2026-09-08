/**
 * Example Node script to export PostgreSQL tables to JSON files.
 * Usage: node scripts/pg_export_example.js <DATABASE_URL>
 * Output folder: exports/
 */
const fs = require('fs');
const { Client } = require('pg');

async function run() {
  const db = process.argv[2];
  if (!db) { console.error('Usage: node scripts/pg_export_example.js <DATABASE_URL>'); process.exit(1); }
  const client = new Client({ connectionString: db });
  await client.connect();
  const tables = ['users','profiles','posts','post_media','reactions','comments','shares','follows','notifications','conversations','messages','groups','polls','poll_options','poll_votes'];
  if (!fs.existsSync('exports')) fs.mkdirSync('exports');
  for (const t of tables) {
    try {
      const res = await client.query(`SELECT * FROM ${t}`);
      fs.writeFileSync(`exports/${t}.json`, JSON.stringify(res.rows, null, 2));
      console.log('exported', t, res.rowCount);
    } catch (e) {
      console.warn('skip', t, e.message);
    }
  }
  await client.end();
}
run().catch(e=>{console.error(e);process.exit(1)});
