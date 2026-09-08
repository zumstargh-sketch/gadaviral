import { verifyCore } from './verify.js';
import { verifyEngagement } from './verifyEngagement.js';
import { sql } from '../src/db/client.js';

export async function verifyDemoData() {
  const issues = [...await verifyCore(), ...await verifyEngagement()];
  return { ok: issues.every((i) => i.ok), issues };
}
