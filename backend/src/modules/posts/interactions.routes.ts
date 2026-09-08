import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../../db/client.js';
import { asyncHandler, validateBody, parsePagination, paginated } from '../../utils/http.js';
import { ApiError } from '../../utils/errors.js';
import { requireAuth, optionalAuth, requireVerifiedEmail } from '../../middleware/auth.js';
import { moderateText } from '../../services/moderation.js';
import { audit } from '../../services/audit.js';
import { notify } from '../../services/notifications.js';
import { fetchPostById } from './helpers.js';

const router = Router();
const REACTIONS = ['LIKE', 'LOVE', 'CELEBRATE', 'HAHA', 'WOW', 'SAD', 'PROUD'] as const;

async function activePostOr404(id: string) {
  const post = await fetchPostById(id);
  if (!post || post.status !== 'ACTIVE') throw ApiError.notFound('Post not found');
  return post;
}

// ─── Reactions (real rows; DB unique constraint prevents duplicates) ─────
router.put('/:id/react', requireAuth, requireVerifiedEmail, validateBody(z.object({
  type: z.enum(REACTIONS).default('LIKE'),
})), asyncHandler(async (req, res) => {
  const post = await activePostOr404(String(req.params.id));
  const existing = await sql`
    SELECT id, type FROM reactions WHERE post_id = ${post.id} AND user_id = ${req.authUser!.id}`;
  if (existing.length > 0) {
    if (existing[0].type === req.body.type) {
      return res.json({ reacted: true, type: existing[0].type, changed: false });
    }
    await sql`UPDATE reactions SET type = ${req.body.type} WHERE id = ${existing[0].id}`;
  } else {
    await sql`
      INSERT INTO reactions (post_id, user_id, type) VALUES (${post.id}, ${req.authUser!.id}, ${req.body.type})`;
    await notify({
      userId: post.author_id, actorId: req.authUser!.id, type: 'REACTION',
      entityType: 'post', entityId: post.id,
      body: `reacted ${req.body.type.toLowerCase()} to your post`,
    });
  }
  res.json({ reacted: true, type: req.body.type, changed: true });
}));

router.delete('/:id/react', requireAuth, asyncHandler(async (req, res) => {
  await sql`DELETE FROM reactions WHERE post_id = ${String(req.params.id)} AND user_id = ${req.authUser!.id}`;
  res.json({ reacted: false });
}));

// ─── Comments & replies ────────────────────────────────────────────
router.get('/:id/comments', optionalAuth, asyncHandler(async (req, res) => {
  const postId = String(req.params.id);
  const { page, limit, offset } = parsePagination(req.query);
  const [items, count] = await Promise.all([
    sql`
      SELECT c.id, c.content, c.parent_comment_id, c.created_at, c.edited_at, c.status,
             u.id AS author_id, u.username AS author_username, u.full_name AS author_name,
             pr.avatar_url AS author_avatar,
             (SELECT count(*) FROM comments r WHERE r.parent_comment_id = c.id AND r.status = 'ACTIVE') AS reply_count
      FROM comments c JOIN users u ON u.id = c.author_id LEFT JOIN profiles pr ON pr.user_id = u.id
      WHERE c.post_id = ${postId} AND c.status = 'ACTIVE' AND c.parent_comment_id IS NULL
      ORDER BY c.created_at ASC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM comments WHERE post_id = ${postId} AND status = 'ACTIVE' AND parent_comment_id IS NULL`,
  ]);
  res.json(paginated(items, Number(count[0].n), page, limit));
}));

router.get('/comments/:commentId/replies', asyncHandler(async (req, res) => {
  const items = await sql`
    SELECT c.id, c.content, c.parent_comment_id, c.created_at,
           u.id AS author_id, u.username AS author_username, u.full_name AS author_name,
           pr.avatar_url AS author_avatar
    FROM comments c JOIN users u ON u.id = c.author_id LEFT JOIN profiles pr ON pr.user_id = u.id
    WHERE c.parent_comment_id = ${String(req.params.commentId)} AND c.status = 'ACTIVE'
    ORDER BY c.created_at ASC LIMIT 200`;
  res.json({ items });
}));

router.post('/:id/comments', requireAuth, requireVerifiedEmail, validateBody(z.object({
  content: z.string().min(1).max(2000),
  parentCommentId: z.string().uuid().optional(),
})), asyncHandler(async (req, res) => {
  const post = await activePostOr404(String(req.params.id));
  let parent: any = null;
  if (req.body.parentCommentId) {
    const rows = await sql`
      SELECT id, post_id, author_id FROM comments
      WHERE id = ${req.body.parentCommentId} AND post_id = ${post.id} AND status = 'ACTIVE'`;
    parent = rows[0] ?? null;
    if (!parent) throw ApiError.badRequest('Parent comment not found');
  }
  const mod = await moderateText(req.body.content);
  if (mod.status === 'REJECTED') throw ApiError.badRequest('This comment violates our community standards', { flags: mod.flags });

  const rows = await sql`
    INSERT INTO comments (post_id, author_id, parent_comment_id, content, status, moderation)
    VALUES (${post.id}, ${req.authUser!.id}, ${parent?.id ?? null}, ${mod.sanitized},
            ${mod.status === 'PENDING_REVIEW' ? 'PENDING_REVIEW' : 'ACTIVE'},
            ${JSON.stringify({ flags: mod.flags })}::jsonb)
    RETURNING *`;
  const comment = rows[0];
  if (mod.status === 'APPROVED') {
    await notify({
      userId: post.author_id, actorId: req.authUser!.id,
      type: parent ? 'REPLY' : 'COMMENT', entityType: parent ? 'comment' : 'post',
      entityId: (parent?.id ?? post.id) as string,
      body: mod.sanitized.slice(0, 140),
    });
  }
  res.status(201).json({ comment: { ...comment, author_username: req.authUser!.username, author_name: req.authUser!.full_name } });
}));

export default router;
