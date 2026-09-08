import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireRoleAtLeast } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { seedDemo } from '../../seeds/demoManager.js';
import { wipeDemoData } from '../../seeds/demoWipe.js';
import { demoStats } from '../../seeds/stats.js';
import { verifyDemoData } from '../../seeds/verifyApi.js';

const router = Router();
router.use(requireAuth, requireRoleAtLeast('ADMIN'));

router.get('/stats', asyncHandler(async (_req, res) => {
  res.json(await demoStats());
}));

router.get('/verify', asyncHandler(async (_req, res) => {
  res.json(await verifyDemoData());
}));

router.post('/seed', validateBody(z.object({ force: z.boolean().default(false) })),
  asyncHandler(async (req, res) => {
    try {
      const report = await seedDemo({ force: req.body.force });
      await audit(req.authUser!.id, 'DEMO_SEEDED', 'system', null, { batch: report.batch });
      res.json({ ok: true, report });
    } catch (e: any) {
      throw ApiError.conflict(e?.message ?? 'Seed failed');
    }
  }));

router.post('/wipe', asyncHandler(async (req, res) => {
  const counts = await wipeDemoData();
  await audit(req.authUser!.id, 'DEMO_WIPED', 'system', null, { counts });
  res.json({ ok: true, counts });
}));

export default router;
