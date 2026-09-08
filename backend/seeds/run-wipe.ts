import { wipeDemoData } from './demoWipe.js';
import { sql } from '../src/db/client.js';

try {
  console.log('[demo:wipe] deleting demo/seed data (real users untouched)…');
  const counts = await wipeDemoData();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log('[demo:wipe] removed:', counts);
  console.log(`[demo:wipe] done — ${total} rows removed.`);
} catch (e: any) {
  console.error('[demo:wipe] FAILED:', e?.message ?? e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
