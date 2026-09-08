import { Router } from 'express';
import { z } from 'zod';
import { sql, andJoin } from '../db/client.js';
import { asyncHandler, validateBody, parsePagination, paginated } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { moderateText } from '../services/moderation.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notifications.js';
import { slugify } from './groups.routes.js';

const router = Router();

const createSchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().max(4000).default(''),
  category: z.string().max(60).default('COMMUNITY'),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  location: z.string().min(2).max(240),
  community: z.string().max(120).optional(),
  onlineUrl: z.string().url().optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const upcoming = String(req.query.upcoming ?? 'true') === 'true';
  const conds = [sql`e.status = 'ACTIVE'`];
  if (upcoming) conds.push(sql`e.starts_at >= now() - interval '1 day'`);
  const where = andJoin(conds, sql` AND `);
  const [items, count] = await Promise.all([
    sql`
      SELECT e.*, u.username AS organizer_username,
        (SELECT count(*) FROM event_members m WHERE m.event_id = e.id AND m.rsvp = 'GOING') AS going_count,
        (SELECT count(*) FROM event_members m WHERE m.event_id = e.id AND m.rsvp = 'INTERESTED') AS interested_count
      FROM events e LEFT JOIN users u ON u.id = e.organizer_id
      WHERE ${where} ORDER BY e.starts_at ASC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM events e WHERE ${where}`,
  ]);
  res.json(paginated(items, Number(count[0].n), page, limit));
}));

router.post('/', requireAuth, validateBody(createSchema), asyncHandler(async (req, res) => {
  const mod = await moderateText(`${req.body.title} ${req.body.description}`);
  if (mod.status === 'REJECTED') throw ApiError.badRequest('Event details violate community standards');
  let slug = slugify(req.body.title);
  const taken = await sql`SELECT 1 FROM events WHERE slug = ${slug}`;
  if (taken.length > 0) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const rows = await sql`
    INSERT INTO events (slug, title, description, category, starts_at, ends_at, location, community, online_url, organizer_id)
    VALUES (${slug}, ${req.body.title}, ${req.body.description}, ${req.body.category},
            ${req.body.startsAt}, ${req.body.endsAt ?? null}, ${req.body.location},
            ${req.body.community ?? null}, ${req.body.onlineUrl ?? null}, ${req.authUser!.id})
    RETURNING *`;
  await audit(req.authUser!.id, 'EVENT_CREATED', 'event', rows[0].id);
  res.status(201).json({ event: rows[0] });
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  const rows = await sql`
    SELECT e.*, u.username AS organizer_username,
      (SELECT count(*) FROM event_members m WHERE m.event_id = e.id AND m.rsvp = 'GOING') AS going_count,
      (SELECT count(*) FROM event_members m WHERE m.event_id = e.id AND m.rsvp = 'INTERESTED') AS interested_count
    FROM events e LEFT JOIN users u ON u.id = e.organizer_id
    WHERE e.slug = ${String(req.params.slug).toLowerCase()}`;
  if (rows.length === 0) throw ApiError.notFound('Event not found');
  res.json({ event: rows[0] });
}));

router.post('/:slug/rsvp', requireAuth, validateBody(z.object({
  rsvp: z.enum(['GOING', 'INTERESTED', 'NONE']),
})), asyncHandler(async (req, res) => {
  const e = await sql`SELECT * FROM events WHERE slug = ${String(req.params.slug).toLowerCase()}`;
  const event = e[0];
  if (!event) throw ApiError.notFound('Event not found');
  if (req.body.rsvp === 'NONE') {
    await sql`DELETE FROM event_members WHERE event_id = ${event.id} AND user_id = ${req.authUser!.id}`;
    return res.json({ rsvp: null });
  }
  await sql`
    INSERT INTO event_members (event_id, user_id, rsvp) VALUES (${event.id}, ${req.authUser!.id}, ${req.body.rsvp})
    ON CONFLICT (event_id, user_id) DO UPDATE SET rsvp = EXCLUDED.rsvp`;
  await notify({
    userId: event.organizer_id, actorId: req.authUser!.id, type: 'EVENT',
    entityType: 'event', entityId: event.id,
    body: `is ${req.body.rsvp === 'GOING' ? 'going to' : 'interested in'} ${event.title}`,
  });
  res.json({ rsvp: req.body.rsvp });
}));

router.get('/:slug/attendees', asyncHandler(async (req, res) => {
  const e = await sql`SELECT id FROM events WHERE slug = ${String(req.params.slug).toLowerCase()}`;
  if (e.length === 0) throw ApiError.notFound('Event not found');
  const items = await sql`
    SELECT u.id, u.username, u.full_name, p.avatar_url, m.rsvp
    FROM event_members m JOIN users u ON u.id = m.user_id LEFT JOIN profiles p ON p.user_id = u.id
    WHERE m.event_id = ${e[0].id} ORDER BY m.created_at LIMIT 200`;
  res.json({ items });
}));

export default router;
