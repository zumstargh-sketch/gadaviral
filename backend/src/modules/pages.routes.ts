import { Router } from 'express';
import { z } from 'zod';
import { sql, andJoin } from '../db/client.js';
import { asyncHandler, validateBody, parsePagination, paginated } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { moderateText } from '../services/moderation.js';
import { audit } from '../services/audit.js';
import { slugify } from './groups.routes.js';

const router = Router();

const createSchema = z.object({
  name: z.string().min(3).max(100),
  category: z.string().max(60).default('COMMUNITY'),
  description: z.string().max(2000).default(''),
});

router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const q = String(req.query.q ?? '').trim();
  const conds = [sql`1=1`];
  if (q) conds.push(sql`(pg.name ILIKE ${`%${q}%`} OR pg.description ILIKE ${`%${q}%`})`);
  const where = andJoin(conds, sql` AND `);
  const [items, count] = await Promise.all([
    sql`SELECT pg.*, (pf.user_id IS NOT NULL) AS following
        FROM pages pg
        LEFT JOIN page_followers pf ON pf.page_id = pg.id AND pf.user_id = ${req.authUser?.id ?? null}
        WHERE ${where} ORDER BY pg.follower_count DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM pages pg WHERE ${where}`,
  ]);
  res.json(paginated(items, Number(count[0].n), page, limit));
}));

router.post('/', requireAuth, validateBody(createSchema), asyncHandler(async (req, res) => {
  const mod = await moderateText(`${req.body.name} ${req.body.description}`);
  if (mod.status === 'REJECTED') throw ApiError.badRequest('Page details violate community standards');
  let slug = slugify(req.body.name);
  const taken = await sql`SELECT 1 FROM pages WHERE slug = ${slug}`;
  if (taken.length > 0) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const rows = await sql`
    INSERT INTO pages (slug, name, category, description, owner_id)
    VALUES (${slug}, ${req.body.name}, ${req.body.category}, ${req.body.description}, ${req.authUser!.id})
    RETURNING *`;
  await sql`INSERT INTO page_followers (page_id, user_id) VALUES (${rows[0].id}, ${req.authUser!.id})`;
  await audit(req.authUser!.id, 'PAGE_CREATED', 'page', rows[0].id);
  res.status(201).json({ page: { ...rows[0], follower_count: 1 } });
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  const rows = await sql`SELECT * FROM pages WHERE slug = ${String(req.params.slug).toLowerCase()}`;
  if (rows.length === 0) throw ApiError.notFound('Page not found');
  res.json({ page: rows[0] });
}));

router.post('/:slug/follow', requireAuth, asyncHandler(async (req, res) => {
  const rows = await sql`SELECT id FROM pages WHERE slug = ${String(req.params.slug).toLowerCase()}`;
  const page = rows[0];
  if (!page) throw ApiError.notFound('Page not found');
  await sql`INSERT INTO page_followers (page_id, user_id) VALUES (${page.id}, ${req.authUser!.id}) ON CONFLICT DO NOTHING`;
  res.json({ following: true });
}));

router.delete('/:slug/follow', requireAuth, asyncHandler(async (req, res) => {
  const rows = await sql`SELECT id FROM pages WHERE slug = ${String(req.params.slug).toLowerCase()}`;
  const page = rows[0];
  if (!page) throw ApiError.notFound('Page not found');
  await sql`DELETE FROM page_followers WHERE page_id = ${page.id} AND user_id = ${req.authUser!.id}`;
  res.json({ following: false });
}));

export default router;
