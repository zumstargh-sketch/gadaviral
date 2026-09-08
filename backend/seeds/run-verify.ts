import { verifyDemoData } from './verifyApi.js';
import { sql } from '../src/db/client.js';

const result = await verifyDemoData();
for (const issue of result.issues) {
  console.log(`${issue.ok ? '[PASS]' : '[FAIL]'} ${issue.check} — ${issue.detail}`);
}
console.log(result.ok ? '\n[demo:verify] ALL CHECKS PASSED' : '\n[demo:verify] FAILURES DETECTED');
await sql.end();
process.exit(result.ok ? 0 : 1);
