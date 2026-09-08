import { Router } from 'express';
import { sql } from '../db/client.js';

const router = Router();

/** GET /api/v1/health — liveness + database check. */
router.get('/', asyncHandler(async (_req, res) => {
  const started = Date.now();
  let db = 'ok';
  try {
    await sql`SELECT 1`;
  } catch {
    db = 'unreachable';
  }
  res.json({
    status: db === 'ok' ? 'healthy' : 'degraded',
    service: 'gadaviral-api',
    version: '1.0.0',
    db,
    latencyMs: Date.now() - started,
    time: new Date().toISOString(),
  });
}));

function asyncHandler(fn: (req: any, res: any) => Promise<any>) {
  return (req: any, res: any) => { fn(req, res).catch(() => res.status(500).json({ status: 'degraded' })); };
}

export default router;
