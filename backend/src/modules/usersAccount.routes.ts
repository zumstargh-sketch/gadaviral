import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { asyncHandler, validateBody } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { revokeAllSessions } from '../services/tokens.js';

const router = Router();

/** GET /users — search/suggest users (used by search page too). */
router.get('/', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? 20), 10)));
  const offset = (page - 1) * limit;
  if (q.length < 1) return res.json({ items: [], meta: { page, limit, total: 0, totalPages: 1 } });
  const like = `%${q}%`;
  const [items, count] = await Promise.all([
    sql`
      SELECT u.id, u.username, u.full_name, p.avatar_url, u.is_demo, u.follower_count,
             p.bio, p.location, p.community
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE'
        AND (u.username ILIKE ${like} OR u.full_name ILIKE ${like})
      ORDER BY u.follower_count DESC, u.username
      LIMIT ${limit} OFFSET ${offset}`,
    sql`
      SELECT count(*) AS n FROM users
      WHERE deleted_at IS NULL AND status = 'ACTIVE'
        AND (username ILIKE ${like} OR full_name ILIKE ${like})`,
  ]);
  res.json({ items, meta: { page, limit, total: Number(count[0].n), totalPages: Math.max(1, Math.ceil(Number(count[0].n) / limit)) } });
}));

/** GET /users/me/settings — privacy & notification preferences. */
router.get('/me/settings', requireAuth, asyncHandler(async (req, res) => {
  const rows = await sql`
    SELECT privacy, notification_prefs FROM profiles WHERE user_id = ${req.authUser!.id}`;
  res.json({ privacy: rows[0]?.privacy ?? {}, notificationPrefs: rows[0]?.notification_prefs ?? {} });
}));

/** POST /users/me/deactivate — soft-disable the account (reversible by login? no — by support). */
router.post('/me/deactivate', requireAuth, validateBody(z.object({ password: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const userId = req.authUser!.id;
    const rows = await sql`SELECT password_hash FROM users WHERE id = ${userId}`;
    if (rows[0]?.password_hash && req.body.password) {
      const { verifyPassword } = await import('../utils/crypto.js');
      if (!verifyPassword(req.body.password, rows[0].password_hash)) {
        throw ApiError.badRequest('Password is incorrect');
      }
    }
    await sql`UPDATE users SET status = 'DEACTIVATED' WHERE id = ${userId}`;
    await revokeAllSessions(userId);
    await audit(userId, 'ACCOUNT_DEACTIVATED', 'user', userId);
    res.json({ message: 'Account deactivated' });
  }));

/** POST /users/me/reactivate */
router.post('/me/reactivate', requireAuth, asyncHandler(async (req, res) => {
  await sql`UPDATE users SET status = 'ACTIVE' WHERE id = ${req.authUser!.id}`;
  await audit(req.authUser!.id, 'ACCOUNT_REACTIVATED', 'user', req.authUser!.id);
  res.json({ message: 'Account reactivated' });
}));

export default router;
