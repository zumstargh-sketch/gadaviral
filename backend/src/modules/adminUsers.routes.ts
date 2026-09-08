import { Router } from 'express';
import { z } from 'zod';
import { sql, andJoin } from '../db/client.js';
import { asyncHandler, validateBody, parsePagination, paginated } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireRoleAtLeast } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { revokeAllSessions } from '../services/tokens.js';
import { notify } from '../services/notifications.js';

const router = Router();
router.use(requireAuth, requireRoleAtLeast('ADMIN'));

// ─── User management ────────────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const q = String(req.query.q ?? '').trim();
  const status = String(req.query.status ?? '');
  const demo = String(req.query.demo ?? '');
  const conds = [sql`1=1`];
  if (q) conds.push(sql`(u.username ILIKE ${`%${q}%`} OR u.full_name ILIKE ${`%${q}%`} OR u.email ILIKE ${`%${q}%`})`);
  if (['ACTIVE', 'SUSPENDED', 'BANNED', 'DEACTIVATED'].includes(status)) conds.push(sql`u.status = ${status}`);
  if (demo === 'true') conds.push(sql`u.is_demo = true`);
  if (demo === 'false') conds.push(sql`u.is_demo = false`);
  const where = andJoin(conds, sql` AND `);
  const [items, count] = await Promise.all([
    sql`
      SELECT u.id, u.email, u.username, u.full_name, u.role, u.status, u.email_verified,
             u.auth_provider, u.is_demo, u.created_at, u.last_login_at, p.avatar_url, p.location
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE ${where} ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM users u WHERE ${where}`,
  ]);
  res.json(paginated(items, Number(count[0].n), page, limit));
}));

router.post('/:id/status', validateBody(z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']),
  reason: z.string().max(500).optional(),
})), asyncHandler(async (req, res) => {
  const target = await sql`SELECT id, role FROM users WHERE id = ${String(req.params.id)}`;
  if (target.length === 0) throw ApiError.notFound('User not found');
  if (['ADMIN', 'SUPER_ADMIN'].includes(target[0].role) && req.authUser!.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only a super admin can change admin accounts');
  }
  await sql`
    UPDATE users SET status = ${req.body.status}, suspension_reason = ${req.body.reason ?? null}
    WHERE id = ${target[0].id}`;
  await revokeAllSessions(target[0].id);
  if (req.body.status !== 'ACTIVE') {
    await notify({
      userId: target[0].id, type: 'MODERATION',
      body: `Your account status changed to ${req.body.status}. ${req.body.reason ?? ''}`.trim(),
    });
  }
  await audit(req.authUser!.id, `USER_${req.body.status}`, 'user', target[0].id, { reason: req.body.reason });
  res.json({ ok: true });
}));

router.post('/:id/verify', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const r = await sql`
    UPDATE users SET email_verified = true, email_verified_at = now() WHERE id = ${id} RETURNING id`;
  if (r.length === 0) throw ApiError.notFound('User not found');
  await audit(req.authUser!.id, 'USER_MANUALLY_VERIFIED', 'user', id);
  res.json({ ok: true });
}));

router.post('/:id/role', requireRoleAtLeast('SUPER_ADMIN'), validateBody(z.object({
  role: z.enum(['USER', 'MODERATOR', 'ADMIN']),
})), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const target = await sql`SELECT role FROM users WHERE id = ${id}`;
  if (target.length === 0) throw ApiError.notFound('User not found');
  if (target[0].role === 'SUPER_ADMIN') throw ApiError.forbidden('Cannot change a super admin role');
  await sql`UPDATE users SET role = ${req.body.role} WHERE id = ${id}`;
  await audit(req.authUser!.id, 'USER_ROLE_CHANGED', 'user', id, { role: req.body.role });
  res.json({ ok: true });
}));

export default router;
