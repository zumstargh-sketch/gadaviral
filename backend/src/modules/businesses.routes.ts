import { Router } from 'express';
import { z } from 'zod';
import { sql, andJoin } from '../db/client.js';
import { asyncHandler, validateBody, parsePagination, paginated } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { moderateText } from '../services/moderation.js';
import { audit } from '../services/audit.js';
import { slugify } from './groups.routes.js';

const router = Router();

const CATEGORIES = ['RESTAURANT', 'FASHION', 'FOOD_VENDOR', 'EVENT_SERVICES', 'PHOTOGRAPHY', 'TRANSPORT',
  'PROFESSIONAL', 'ARTISAN', 'TOURISM', 'CATERING', 'DIGITAL', 'LOCAL_SHOP', 'OTHER'] as const;

const createSchema = z.object({
  name: z.string().min(2).max(120),
  category: z.enum(CATEGORIES),
  description: z.string().max(3000).default(''),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  address: z.string().max(240).optional(),
  area: z.string().max(120).optional(),
  openingHours: z.string().max(240).optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const q = String(req.query.q ?? '').trim();
  const category = String(req.query.category ?? '');
  const conds = [sql`b.status = 'ACTIVE'`];
  if (q) conds.push(sql`(b.name ILIKE ${`%${q}%`} OR b.description ILIKE ${`%${q}%`})`);
  if (CATEGORIES.includes(category as any)) conds.push(sql`b.category = ${category}`);
  const where = andJoin(conds, sql` AND `);
  const [items, count] = await Promise.all([
    sql`SELECT * FROM businesses b WHERE ${where}
        ORDER BY b.verified DESC, b.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM businesses b WHERE ${where}`,
  ]);
  res.json(paginated(items, Number(count[0].n), page, limit));
}));

router.post('/', requireAuth, validateBody(createSchema), asyncHandler(async (req, res) => {
  const mod = await moderateText(`${req.body.name} ${req.body.description}`);
  if (mod.status === 'REJECTED') throw ApiError.badRequest('Business details violate community standards');
  let slug = slugify(req.body.name);
  const taken = await sql`SELECT 1 FROM businesses WHERE slug = ${slug}`;
  if (taken.length > 0) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const rows = await sql`
    INSERT INTO businesses (slug, name, category, description, owner_id, phone, email, website, address, area, opening_hours, status)
    VALUES (${slug}, ${req.body.name}, ${req.body.category}, ${req.body.description}, ${req.authUser!.id},
            ${req.body.phone ?? null}, ${req.body.email ?? null}, ${req.body.website ?? null},
            ${req.body.address ?? null}, ${req.body.area ?? null}, ${req.body.openingHours ?? null},
            ${mod.status === 'PENDING_REVIEW' ? 'PENDING_REVIEW' : 'ACTIVE'})
    RETURNING *`;
  await audit(req.authUser!.id, 'BUSINESS_CREATED', 'business', rows[0].id);
  res.status(201).json({ business: rows[0] });
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  const rows = await sql`
    SELECT b.*, u.username AS owner_username FROM businesses b
    LEFT JOIN users u ON u.id = b.owner_id
    WHERE b.slug = ${String(req.params.slug).toLowerCase()} AND b.status <> 'REMOVED'`;
  if (rows.length === 0) throw ApiError.notFound('Business not found');
  res.json({ business: rows[0] });
}));

router.delete('/:slug', requireAuth, asyncHandler(async (req, res) => {
  const rows = await sql`SELECT id, owner_id FROM businesses WHERE slug = ${String(req.params.slug).toLowerCase()}`;
  const b = rows[0];
  if (!b) throw ApiError.notFound('Business not found');
  const privileged = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(req.authUser!.role);
  if (b.owner_id !== req.authUser!.id && !privileged) throw ApiError.forbidden('Not your business listing');
  await sql`UPDATE businesses SET status = 'REMOVED' WHERE id = ${b.id}`;
  await audit(req.authUser!.id, privileged ? 'MODERATION_REMOVE_BUSINESS' : 'BUSINESS_REMOVED', 'business', b.id);
  res.json({ deleted: true });
}));

export default router;
