import { Router } from 'express';
import { z } from 'zod';
import { sql, andJoin } from '../db/client.js';
import { asyncHandler, validateBody, parsePagination, paginated } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireRoleAtLeast } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notifications.js';

const router = Router();
router.use(requireAuth, requireRoleAtLeast('MODERATOR'));

/** GET /moderation/queue — reports + flagged content. */
router.get('/queue', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const status = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'].includes(String(req.query.status))
    ? String(req.query.status) : 'OPEN';
  const [items, count] = await Promise.all([
    sql`
      SELECT r.*, ru.username AS reporter_username,
        mu.username AS handled_by_username
      FROM reports r
      LEFT JOIN users ru ON ru.id = r.reporter_id
      LEFT JOIN users mu ON mu.id = r.handled_by
      WHERE r.status = ${status}
      ORDER BY r.created_at ASC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM reports WHERE status = ${status}`,
  ]);
  const flagged = await sql`
    SELECT p.id, p.content, p.type, p.status, p.moderation, p.created_at,
           u.username AS author_username
    FROM posts p JOIN users u ON u.id = p.author_id
    WHERE p.status = 'PENDING_REVIEW' ORDER BY p.created_at ASC LIMIT 50`;
  res.json({ ...paginated(items, Number(count[0].n), page, limit), flaggedPosts: flagged });
}));

/** POST /moderation/reports/:id/handle */
router.post('/reports/:id/handle', validateBody(z.object({
  action: z.enum(['REVIEWING', 'RESOLVED', 'DISMISSED']),
  note: z.string().max(1000).optional(),
  removeTarget: z.boolean().default(false),
})), asyncHandler(async (req, res) => {
  const rows = await sql`SELECT * FROM reports WHERE id = ${String(req.params.id)}`;
  const report = rows[0];
  if (!report) throw ApiError.notFound('Report not found');

  if (req.body.removeTarget && ['RESOLVED'].includes(req.body.action)) {
    if (report.target_type === 'POST') {
      await sql`UPDATE posts SET status = 'REMOVED' WHERE id = ${report.target_id}`;
      const author = await sql`SELECT author_id FROM posts WHERE id = ${report.target_id}`;
      if (author.length > 0) {
        await notify({
          userId: author[0].author_id, type: 'MODERATION', entityType: 'post',
          entityId: report.target_id, body: 'Your post was removed for violating community standards.',
        });
      }
    } else if (report.target_type === 'COMMENT') {
      await sql`UPDATE comments SET status = 'REMOVED' WHERE id = ${report.target_id}`;
    }
  }

  await sql`
    UPDATE reports SET status = ${req.body.action}, handled_by = ${req.authUser!.id},
      resolution_note = ${req.body.note ?? null}
    WHERE id = ${report.id}`;
  await sql`
    INSERT INTO moderation_actions (moderator_id, action, target_type, target_id, reason, report_id)
    VALUES (${req.authUser!.id}, ${'RESOLVE_REPORT'}, ${report.target_type}, ${report.target_id},
            ${req.body.note ?? null}, ${report.id})`;
  await audit(req.authUser!.id, `REPORT_${req.body.action}`, report.target_type, report.target_id, { reportId: report.id });
  res.json({ ok: true });
}));

/** POST /moderation/posts/:id/remove | /restore */
async function removeRestore(req: any, res: any) {
  const remove = req.params.action === 'remove';
  const rows = await sql`UPDATE posts SET status = ${remove ? 'REMOVED' : 'ACTIVE'}
    WHERE id = ${String(req.params.id)} RETURNING id, author_id`;
  if (rows.length === 0) throw ApiError.notFound('Post not found');
  await sql`
    INSERT INTO moderation_actions (moderator_id, action, target_type, target_id)
    VALUES (${req.authUser!.id}, ${remove ? 'REMOVE_POST' : 'RESTORE_POST'}, 'POST', ${rows[0].id})`;
  await audit(req.authUser!.id, remove ? 'MODERATION_REMOVE_POST' : 'MODERATION_RESTORE_POST', 'post', rows[0].id);
  if (remove) {
    await notify({
      userId: rows[0].author_id, type: 'MODERATION', entityType: 'post', entityId: rows[0].id,
      body: 'Your post was removed by a moderator.',
    });
  }
  res.json({ ok: true });
}
router.post('/posts/:id/remove', removeRestore);
router.post('/posts/:id/restore', removeRestore);

/** GET /moderation/logs — recent moderation actions. */
router.get('/logs', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const [items, count] = await Promise.all([
    sql`
      SELECT ma.*, u.username AS moderator_username
      FROM moderation_actions ma LEFT JOIN users u ON u.id = ma.moderator_id
      ORDER BY ma.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM moderation_actions`,
  ]);
  res.json(paginated(items, Number(count[0].n), page, limit));
}));

export default router;
