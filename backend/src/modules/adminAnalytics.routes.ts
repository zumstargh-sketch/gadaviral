import { Router } from 'express';
import { sql } from '../db/client.js';
import { asyncHandler, parsePagination, paginated } from '../utils/http.js';
import { requireAuth, requireRoleAtLeast } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRoleAtLeast('ADMIN'));

router.get('/analytics', asyncHandler(async (_req, res) => {
  const [totals, daily, active] = await Promise.all([
    sql`
      SELECT
        (SELECT count(*) FROM users WHERE deleted_at IS NULL) AS users,
        (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days') AS new_users_7d,
        (SELECT count(*) FROM posts WHERE status = 'ACTIVE') AS posts,
        (SELECT count(*) FROM comments WHERE status = 'ACTIVE') AS comments,
        (SELECT count(*) FROM reactions) AS reactions,
        (SELECT count(*) FROM shares) AS shares,
        (SELECT count(*) FROM post_views) AS views,
        (SELECT count(*) FROM groups) AS groups,
        (SELECT count(*) FROM events) AS events,
        (SELECT count(*) FROM businesses WHERE status = 'ACTIVE') AS businesses,
        (SELECT count(*) FROM messages) AS messages`,
    sql`
      SELECT d::date AS day,
        (SELECT count(*) FROM users u WHERE u.created_at::date = d::date) AS users,
        (SELECT count(*) FROM posts p WHERE p.created_at::date = d::date) AS posts,
        (SELECT count(*) FROM reactions r WHERE r.created_at::date = d::date) AS reactions
      FROM generate_series(now() - interval '29 days', now(), interval '1 day') d
      ORDER BY day`,
    sql`SELECT count(*) AS n FROM users WHERE last_login_at > now() - interval '24 hours'`,
  ]);
  res.json({
    totals: {
      users: Number(totals[0].users), new_users_7d: Number(totals[0].new_users_7d),
      posts: Number(totals[0].posts), comments: Number(totals[0].comments),
      reactions: Number(totals[0].reactions), shares: Number(totals[0].shares),
      views: Number(totals[0].views), groups: Number(totals[0].groups),
      events: Number(totals[0].events), businesses: Number(totals[0].businesses),
      messages: Number(totals[0].messages),
    },
    activeLast24h: Number(active[0].n),
    daily,
  });
}));

router.get('/content/posts', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const [items, count] = await Promise.all([
    sql`
      SELECT p.id, p.type, p.content, p.status, p.created_at, p.is_demo,
             u.username AS author_username, u.full_name AS author_name
      FROM posts p JOIN users u ON u.id = p.author_id
      ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM posts`,
  ]);
  res.json(paginated(items, Number(count[0].n), page, limit));
}));

router.get('/audit-logs', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const [items, count] = await Promise.all([
    sql`
      SELECT a.*, u.username AS actor_username
      FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM audit_logs`,
  ]);
  res.json(paginated(items, Number(count[0].n), page, limit));
}));

export default router;
