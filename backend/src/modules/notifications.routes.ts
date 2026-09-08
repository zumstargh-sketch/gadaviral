import { Router } from 'express';
import { z } from 'zod';
import { sql, andJoin } from '../db/client.js';
import { asyncHandler, validateBody, parsePagination, paginated } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { markRead } from '../services/notifications.js';

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const [items, count, unread] = await Promise.all([
    sql`
      SELECT n.*, a.username AS actor_username, a.full_name AS actor_name, pa.avatar_url AS actor_avatar
      FROM notifications n
      LEFT JOIN users a ON a.id = n.actor_id
      LEFT JOIN profiles pa ON pa.user_id = a.id
      WHERE n.user_id = ${req.authUser!.id}
      ORDER BY n.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM notifications WHERE user_id = ${req.authUser!.id}`,
    sql`SELECT count(*) AS n FROM notifications WHERE user_id = ${req.authUser!.id} AND read_at IS NULL`,
  ]);
  res.json({ ...paginated(items, Number(count[0].n), page, limit), unreadCount: Number(unread[0].n) });
}));

router.post('/read', requireAuth, validateBody(z.object({ ids: z.array(z.string().uuid()).optional() })),
  asyncHandler(async (req, res) => {
    await markRead(req.authUser!.id, req.body.ids);
    res.json({ ok: true });
  }));

export default router;
