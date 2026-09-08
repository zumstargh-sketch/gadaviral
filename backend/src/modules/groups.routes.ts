import { Router } from 'express';
import { z } from 'zod';
import { sql, andJoin } from '../db/client.js';
import { asyncHandler, validateBody, validateQuery, parsePagination, paginated } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { moderateText } from '../services/moderation.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notifications.js';

const router = Router();

const createSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(2000).default(''),
  category: z.string().max(60).default('COMMUNITY'),
  privacy: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
});

export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}

router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const q = String(req.query.q ?? '').trim();
  const category = String(req.query.category ?? '');
  const conds = [sql`1=1`];
  if (q) conds.push(sql`(g.name ILIKE ${`%${q}%`} OR g.description ILIKE ${`%${q}%`})`);
  if (category) conds.push(sql`g.category = ${category}`);
  const where = andJoin(conds, sql` AND `);
  const [items, count] = await Promise.all([
    sql`SELECT g.*, (gm.user_id IS NOT NULL) AS joined
        FROM groups g
        LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ${req.authUser?.id ?? null}
        WHERE ${where} ORDER BY g.member_count DESC, g.created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM groups g WHERE ${where}`,
  ]);
  res.json(paginated(items, Number(count[0].n), page, limit));
}));

router.post('/', requireAuth, validateBody(createSchema), asyncHandler(async (req, res) => {
  const mod = await moderateText(`${req.body.name} ${req.body.description}`);
  if (mod.status === 'REJECTED') throw ApiError.badRequest('Group details violate community standards');
  let slug = slugify(req.body.name);
  const taken = await sql`SELECT 1 FROM groups WHERE slug = ${slug}`;
  if (taken.length > 0) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const rows = await sql`
    INSERT INTO groups (slug, name, description, category, privacy, creator_id)
    VALUES (${slug}, ${req.body.name}, ${req.body.description}, ${req.body.category}, ${req.body.privacy}, ${req.authUser!.id})
    RETURNING *`;
  await sql`
    INSERT INTO group_members (group_id, user_id, role) VALUES (${rows[0].id}, ${req.authUser!.id}, 'OWNER')`;
  await audit(req.authUser!.id, 'GROUP_CREATED', 'group', rows[0].id);
  res.status(201).json({ group: { ...rows[0], member_count: 1 } });
}));

router.get('/:slug', optionalAuth, asyncHandler(async (req, res) => {
  const rows = await sql`
    SELECT g.*, (gm.user_id IS NOT NULL) AS joined, gm.role AS my_role
    FROM groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ${req.authUser?.id ?? null}
    WHERE g.slug = ${String(req.params.slug).toLowerCase()}`;
  if (rows.length === 0) throw ApiError.notFound('Group not found');
  res.json({ group: rows[0] });
}));

router.post('/:slug/join', requireAuth, asyncHandler(async (req, res) => {
  const g = await sql`SELECT * FROM groups WHERE slug = ${String(req.params.slug).toLowerCase()}`;
  const group = g[0];
  if (!group) throw ApiError.notFound('Group not found');
  const status = group.privacy === 'PRIVATE' ? 'PENDING' : 'ACTIVE';
  await sql`
    INSERT INTO group_members (group_id, user_id, status) VALUES (${group.id}, ${req.authUser!.id}, ${status})
    ON CONFLICT (group_id, user_id) DO UPDATE SET status = EXCLUDED.status`;
  await notify({
    userId: group.creator_id, actorId: req.authUser!.id, type: 'GROUP',
    entityType: 'group', entityId: group.id,
    body: `asked to join ${group.name}`,
  });
  res.json({ joined: status === 'ACTIVE', pending: status === 'PENDING' });
}));

router.post('/:slug/leave', requireAuth, asyncHandler(async (req, res) => {
  const g = await sql`SELECT id FROM groups WHERE slug = ${String(req.params.slug).toLowerCase()}`;
  if (g.length === 0) throw ApiError.notFound('Group not found');
  await sql`DELETE FROM group_members WHERE group_id = ${g[0].id} AND user_id = ${req.authUser!.id}`;
  res.json({ joined: false });
}));

router.get('/:slug/members', asyncHandler(async (req, res) => {
  const g = await sql`SELECT id FROM groups WHERE slug = ${String(req.params.slug).toLowerCase()}`;
  if (g.length === 0) throw ApiError.notFound('Group not found');
  const { page, limit, offset } = parsePagination(req.query);
  const [items, count] = await Promise.all([
    sql`
      SELECT u.id, u.username, u.full_name, p.avatar_url, gm.role, gm.joined_at
      FROM group_members gm JOIN users u ON u.id = gm.user_id LEFT JOIN profiles p ON p.user_id = u.id
      WHERE gm.group_id = ${g[0].id} AND gm.status = 'ACTIVE'
      ORDER BY (gm.role = 'OWNER') DESC, gm.joined_at LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM group_members WHERE group_id = ${g[0].id} AND status = 'ACTIVE'`,
  ]);
  res.json(paginated(items, Number(count[0].n), page, limit));
}));

export default router;
