import { Router } from 'express';
import { z } from 'zod';
import { sql, andJoin } from '../../db/client.js';
import { asyncHandler, validateBody, parsePagination, paginated } from '../../utils/http.js';
import { ApiError } from '../../utils/errors.js';
import { requireAuth, optionalAuth } from '../../middleware/auth.js';
import { moderateText } from '../../services/moderation.js';
import { audit } from '../../services/audit.js';
import { hydratePosts, fetchPostById, canSeePost, excludedAuthorFilter, POST_SELECT } from './helpers.js';

const router = Router();

function baseWhere(viewerId: string | null, excluded: string[] | null) {
  const conds = [sql`p.status = 'ACTIVE'`, sql`u.deleted_at IS NULL`, sql`u.status = 'ACTIVE'`];
  if (viewerId && excluded && excluded.length > 0) {
    conds.push(sql`p.author_id NOT IN ${sql(excluded)}`);
  }
  return conds;
}

/**
 * GET /posts?feed=recent|following|recommended&username=&groupId=&type=
 * Paginated feed with cursor-free page navigation (infinite scroll on clients).
 */
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const viewerId = req.authUser?.id ?? null;
  const { page, limit, offset } = parsePagination(req.query);
  const feed = String(req.query.feed ?? 'recent');
  const conds = baseWhere(viewerId, await excludedAuthorFilter(viewerId));

  if (req.query.username) {
    conds.push(sql`u.username = ${String(req.query.username).toLowerCase()}`);
  }
  if (req.query.groupId && z.string().uuid().safeParse(req.query.groupId).success) {
    conds.push(sql`p.group_id = ${String(req.query.groupId)}`);
  }
  if (req.query.type && ['TEXT', 'PHOTO', 'VIDEO', 'POLL', 'ANNOUNCEMENT'].includes(String(req.query.type))) {
    conds.push(sql`p.type = ${String(req.query.type)}`);
  }
  if (feed === 'following') {
    if (!viewerId) throw ApiError.unauthorized();
    conds.push(sql`(p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ${viewerId}) OR p.author_id = ${viewerId})`);
  }
  if (feed === 'recommended') {
    // Cultural relevance ordering: engagement + recency blend (real counts only)
    // implemented below via ORDER BY.
  }

  const where = andJoin(conds, sql` AND `);
  const orderBy = feed === 'recommended'
    ? sql`(p.reaction_count * 2 + p.comment_count * 3 + p.share_count * 4) DESC, p.created_at DESC`
    : sql`p.created_at DESC`;

  const [rows, countRows] = await Promise.all([
    sql`
      SELECT ${POST_SELECT} FROM posts p
      JOIN users u ON u.id = p.author_id LEFT JOIN profiles pr ON pr.user_id = u.id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}`,
    sql`
      SELECT count(*) AS n FROM posts p JOIN users u ON u.id = p.author_id WHERE ${where}`,
  ]);
  // Visibility filter for non-public posts (cheap post-filter; page sizes are small)
  const visible: any[] = [];
  for (const post of rows) {
    if (await canSeePost(post, viewerId, req.authUser?.role)) visible.push(post);
  }
  const hydrated = await hydratePosts(visible, viewerId);
  res.json({ ...paginated(hydrated, Number(countRows[0].n), page, limit), feed });
}));

/** GET /posts/:id — single post (records a view for authed viewers). */
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const post = await fetchPostById(String(req.params.id));
  if (!post) throw ApiError.notFound('Post not found');
  if (!(await canSeePost(post, req.authUser?.id ?? null, req.authUser?.role))) {
    throw ApiError.forbidden('This post is not available');
  }
  if (req.authUser && req.authUser.id !== post.author_id) {
    await sql`
      INSERT INTO post_views (post_id, user_id) VALUES (${post.id}, ${req.authUser.id})
      ON CONFLICT DO NOTHING`.catch(() => {});
  }
  const [hydrated] = await hydratePosts([post], req.authUser?.id ?? null);
  res.json({ post: hydrated });
}));

/** PATCH /posts/:id — author edit (re-moderated). */
router.patch('/:id', requireAuth, validateBody(z.object({ content: z.string().min(1).max(8000) })),
  asyncHandler(async (req, res) => {
    const post = await fetchPostById(String(req.params.id));
    if (!post) throw ApiError.notFound('Post not found');
    if (post.author_id !== req.authUser!.id) throw ApiError.forbidden('Not your post');
    const mod = await moderateText(req.body.content);
    if (mod.status === 'REJECTED') throw ApiError.badRequest('This content violates our community standards');
    await sql`
      UPDATE posts SET content = ${mod.sanitized}, edited_at = now(),
        status = ${mod.status === 'PENDING_REVIEW' ? 'PENDING_REVIEW' : 'ACTIVE'}
      WHERE id = ${post.id}`;
    const hydrated = await hydratePosts([await fetchPostById(post.id)], req.authUser!.id);
    res.json({ post: hydrated[0] });
  }));

/** DELETE /posts/:id — author or admin (soft delete keeps integrity). */
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const post = await fetchPostById(String(req.params.id));
  if (!post) throw ApiError.notFound('Post not found');
  const privileged = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(req.authUser!.role);
  if (post.author_id !== req.authUser!.id && !privileged) throw ApiError.forbidden('Not allowed');
  await sql`UPDATE posts SET status = 'REMOVED' WHERE id = ${post.id}`;
  await audit(req.authUser!.id, privileged ? 'MODERATION_REMOVE_POST' : 'POST_DELETED', 'post', post.id);
  res.json({ deleted: true });
}));

export default router;
