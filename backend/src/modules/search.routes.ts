import { Router } from 'express';
import { sql } from '../db/client.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();

/** GET /search?q=&type= — global search across the platform (indexed + trigram). */
router.get('/', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    return res.json({ query: q, users: [], posts: [], groups: [], pages: [], businesses: [], events: [] });
  }
  const like = `%${q}%`;
  const type = String(req.query.type ?? 'all');
  const want = (t: string) => type === 'all' || type === t;

  const [users, posts, groups, pages, businesses, events] = await Promise.all([
    want('users') ? sql`
      SELECT u.id, u.username, u.full_name, p.avatar_url, u.is_demo, u.follower_count, p.bio, p.location
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE'
        AND (u.username ILIKE ${like} OR u.full_name ILIKE ${like})
      ORDER BY similarity(u.username, ${q}) + similarity(u.full_name, ${q}) DESC NULLS LAST,
               u.follower_count DESC
      LIMIT 12` : [],
    want('posts') ? sql`
      SELECT p.id, p.content, p.type, p.created_at, p.reaction_count, p.comment_count,
             u.username AS author_username, u.full_name AS author_name, pr.avatar_url AS author_avatar
      FROM posts p JOIN users u ON u.id = p.author_id LEFT JOIN profiles pr ON pr.user_id = u.id
      WHERE p.status = 'ACTIVE' AND p.visibility = 'PUBLIC' AND p.content ILIKE ${like}
      ORDER BY p.created_at DESC LIMIT 15` : [],
    want('groups') ? sql`
      SELECT id, slug, name, description, member_count, privacy
      FROM groups WHERE name ILIKE ${like} OR description ILIKE ${like}
      ORDER BY member_count DESC LIMIT 8` : [],
    want('pages') ? sql`
      SELECT id, slug, name, description, follower_count
      FROM pages WHERE name ILIKE ${like} OR description ILIKE ${like}
      ORDER BY follower_count DESC LIMIT 8` : [],
    want('businesses') ? sql`
      SELECT id, slug, name, category, description, area
      FROM businesses WHERE status = 'ACTIVE' AND (name ILIKE ${like} OR description ILIKE ${like})
      ORDER BY verified DESC LIMIT 8` : [],
    want('events') ? sql`
      SELECT id, slug, title, starts_at, location, community
      FROM events WHERE status = 'ACTIVE' AND title ILIKE ${like}
      ORDER BY starts_at ASC LIMIT 8` : [],
  ]);
  res.json({ query: q, users, posts, groups, pages, businesses, events });
}));

/** GET /search/suggest — lightweight prefix suggestions. */
router.get('/suggest', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 1) return res.json({ users: [], tags: [] });
  const like = `${q}%`;
  const users = await sql`
    SELECT username, full_name FROM users
    WHERE deleted_at IS NULL AND status = 'ACTIVE' AND username ILIKE ${like}
    ORDER BY follower_count DESC LIMIT 8`;
  res.json({ users });
}));

export default router;
