import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { asyncHandler, validateBody, parsePagination, paginated } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notifications.js';

const router = Router();
const TARGET = sql`
  u.id, u.username, u.full_name, p.avatar_url, u.is_demo, u.follower_count
`;

async function getUserByUsername(username: string) {
  const rows = await sql`SELECT id, status FROM users WHERE username = ${username.toLowerCase()} AND deleted_at IS NULL`;
  if (rows.length === 0) throw ApiError.notFound('User not found');
  return rows[0];
}

// ─── Follow / unfollow ─────────────────────────────────────────────
router.post('/:username/follow', requireAuth, asyncHandler(async (req, res) => {
  const target = await getUserByUsername(String(req.params.username));
  if (target.id === req.authUser!.id) throw ApiError.badRequest('You cannot follow yourself');
  try {
    await sql`
      INSERT INTO follows (follower_id, followee_id) VALUES (${req.authUser!.id}, ${target.id})`;
  } catch (e: any) {
    if (String(e?.code) === '23505' || String(e?.code) === '23505') {
      return res.json({ following: true }); // idempotent
    }
    throw e;
  }
  await notify({
    userId: target.id, actorId: req.authUser!.id, type: 'FOLLOW',
    entityType: 'user', entityId: req.authUser!.id,
  });
  res.json({ following: true });
}));

router.delete('/:username/follow', requireAuth, asyncHandler(async (req, res) => {
  const target = await getUserByUsername(String(req.params.username));
  await sql`DELETE FROM follows WHERE follower_id = ${req.authUser!.id} AND followee_id = ${target.id}`;
  res.json({ following: false });
}));

router.get('/:username/followers', asyncHandler(async (req, res) => {
  const target = await getUserByUsername(String(req.params.username));
  const { page, limit, offset } = parsePagination(req.query);
  const [items, count] = await Promise.all([
    sql`
      SELECT ${TARGET} FROM follows f
      JOIN users u ON u.id = f.follower_id LEFT JOIN profiles p ON p.user_id = u.id
      WHERE f.followee_id = ${target.id}
      ORDER BY f.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM follows WHERE followee_id = ${target.id}`,
  ]);
  res.json(paginated(items, Number(count[0].n), page, limit));
}));

router.get('/:username/following', asyncHandler(async (req, res) => {
  const target = await getUserByUsername(String(req.params.username));
  const { page, limit, offset } = parsePagination(req.query);
  const [items, count] = await Promise.all([
    sql`
      SELECT ${TARGET} FROM follows f
      JOIN users u ON u.id = f.followee_id LEFT JOIN profiles p ON p.user_id = u.id
      WHERE f.follower_id = ${target.id}
      ORDER BY f.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM follows WHERE follower_id = ${target.id}`,
  ]);
  res.json(paginated(items, Number(count[0].n), page, limit));
}));

// ─── Blocks ────────────────────────────────────────────────────────
router.post('/:username/block', requireAuth, asyncHandler(async (req, res) => {
  const target = await getUserByUsername(String(req.params.username));
  if (target.id === req.authUser!.id) throw ApiError.badRequest('You cannot block yourself');
  await sql`
    INSERT INTO blocks (blocker_id, blocked_id) VALUES (${req.authUser!.id}, ${target.id})
    ON CONFLICT DO NOTHING`;
  // Blocking also removes the follow relationship in both directions
  await sql`
    DELETE FROM follows
    WHERE (follower_id = ${req.authUser!.id} AND followee_id = ${target.id})
       OR (follower_id = ${target.id} AND followee_id = ${req.authUser!.id})`;
  await audit(req.authUser!.id, 'USER_BLOCKED', 'user', target.id);
  res.json({ blocked: true });
}));

router.delete('/:username/block', requireAuth, asyncHandler(async (req, res) => {
  const target = await getUserByUsername(String(req.params.username));
  await sql`DELETE FROM blocks WHERE blocker_id = ${req.authUser!.id} AND blocked_id = ${target.id}`;
  res.json({ blocked: false });
}));

router.get('/me/blocks', requireAuth, asyncHandler(async (req, res) => {
  const items = await sql`
    SELECT ${TARGET} FROM blocks b
    JOIN users u ON u.id = b.blocked_id LEFT JOIN profiles p ON p.user_id = u.id
    WHERE b.blocker_id = ${req.authUser!.id} ORDER BY b.created_at DESC`;
  res.json({ items });
}));

// ─── Mutes ─────────────────────────────────────────────────────────
router.post('/:username/mute', requireAuth, validateBody(z.object({ until: z.string().datetime().optional() })),
  asyncHandler(async (req, res) => {
    const target = await getUserByUsername(String(req.params.username));
    if (target.id === req.authUser!.id) throw ApiError.badRequest('You cannot mute yourself');
    await sql`
      INSERT INTO mutes (user_id, muted_id, until_at)
      VALUES (${req.authUser!.id}, ${target.id}, ${req.body.until ?? null})
      ON CONFLICT (user_id, muted_id) DO UPDATE SET until_at = EXCLUDED.until_at`;
    res.json({ muted: true });
  }));

router.delete('/:username/mute', requireAuth, asyncHandler(async (req, res) => {
  const target = await getUserByUsername(String(req.params.username));
  await sql`DELETE FROM mutes WHERE user_id = ${req.authUser!.id} AND muted_id = ${target.id}`;
  res.json({ muted: false });
}));

export default router;
