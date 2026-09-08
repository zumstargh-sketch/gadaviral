import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { asyncHandler, validateBody } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

const TARGETS = ['USER', 'POST', 'COMMENT', 'MESSAGE', 'GROUP', 'PAGE', 'BUSINESS', 'EVENT'] as const;
const CATEGORIES = ['SPAM', 'HARASSMENT', 'HATE_SPEECH', 'SEXUAL_CONTENT', 'VIOLENCE_THREATS',
  'SCAM_FRAUD', 'MISINFORMATION', 'IMPERSONATION', 'SELF_HARM', 'OTHER'] as const;

/** POST /reports — report any entity with a category + optional details. */
router.post('/', requireAuth, validateBody(z.object({
  targetType: z.enum(TARGETS),
  targetId: z.string().uuid(),
  category: z.enum(CATEGORIES),
  details: z.string().max(2000).optional(),
})), asyncHandler(async (req, res) => {
  // Verify the target exists (protects report integrity)
  const tableMap: Record<string, string> = {
    USER: 'users', POST: 'posts', COMMENT: 'comments', MESSAGE: 'messages',
    GROUP: 'groups', PAGE: 'pages', BUSINESS: 'businesses', EVENT: 'events',
  };
  const table = tableMap[req.body.targetType];
  const exists = await sql.unsafe(`SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`, [req.body.targetId]);
  if (exists.length === 0) throw ApiError.notFound('Reported content not found');

  const rows = await sql`
    INSERT INTO reports (reporter_id, target_type, target_id, category, details)
    VALUES (${req.authUser!.id}, ${req.body.targetType}, ${req.body.targetId}, ${req.body.category}, ${req.body.details ?? null})
    RETURNING id`;
  await audit(req.authUser!.id, 'CONTENT_REPORTED', req.body.targetType, req.body.targetId, {
    reportId: rows[0].id, category: req.body.category,
  });
  res.status(201).json({ reportId: rows[0].id, message: 'Thank you. Our moderation team will review this report.' });
}));

export default router;
