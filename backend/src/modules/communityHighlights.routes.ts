import { Router } from 'express';
import { sql } from '../db/client.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();

/**
 * GET /api/v1/community/highlights — PUBLIC preview of the seeded community.
 * Used by the splash screen and the sign-in / sign-up pages to show real
 * member profile pictures (demo members only, no private fields, no auth).
 */
router.get('/highlights', asyncHandler(async (_req, res) => {
  const [items, totalRows] = await Promise.all([
    sql`
      SELECT u.username, u.full_name, p.avatar_url, p.location, p.ethnic_group
      FROM users u
      JOIN profiles p ON p.user_id = u.id
      WHERE u.is_demo = true AND u.deleted_at IS NULL AND p.avatar_url IS NOT NULL
      ORDER BY random()
      LIMIT 12`,
    sql`SELECT count(*)::int AS n FROM users u WHERE u.is_demo = true AND u.deleted_at IS NULL`,
  ]);
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    items: items.map((r: any) => ({
      username: r.username,
      full_name: r.full_name,
      avatar_url: r.avatar_url,
      location: r.location,
      ethnic_group: r.ethnic_group,
    })),
    total: totalRows[0]?.n ?? 0,
  });
}));

export default router;