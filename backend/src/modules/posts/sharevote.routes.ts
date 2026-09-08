import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../../db/client.js';
import { asyncHandler, validateBody } from '../../utils/http.js';
import { ApiError } from '../../utils/errors.js';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth.js';
import { moderateText } from '../../services/moderation.js';
import { audit } from '../../services/audit.js';
import { notify } from '../../services/notifications.js';
import { fetchPostById, hydratePosts } from './helpers.js';
import { insertModeratedPost } from './create.routes.js';

const router = Router();

/** POST /posts/:id/share — real share row; optionally creates a captioned share post. */
router.post('/:id/share', requireAuth, requireVerifiedEmail, validateBody(z.object({
  caption: z.string().max(2000).optional(),
  target: z.enum(['PROFILE', 'GROUP', 'PAGE']).default('PROFILE'),
  targetId: z.string().uuid().optional(),
})), asyncHandler(async (req, res) => {
  const original = await fetchPostById(String(req.params.id));
  if (!original || original.status !== 'ACTIVE') throw ApiError.notFound('Post not found');
  if (original.author_id === req.authUser!.id && req.body.target === 'PROFILE') {
    // Sharing your own post to your own profile adds no value; discourage quietly
  }
  const targetKey = `${req.body.target}:${req.body.targetId ?? req.authUser!.id}`;

  const dup = await sql`
    SELECT 1 FROM shares WHERE post_id = ${original.id} AND user_id = ${req.authUser!.id} AND target_key = ${targetKey}`;
  if (dup.length > 0) throw ApiError.conflict('You already shared this post there');

  const mod = req.body.caption ? await moderateText(req.body.caption) : { sanitized: null as string | null, status: 'APPROVED' as const };
  if (mod.status === 'REJECTED') throw ApiError.badRequest('This caption violates our community standards');

  let sharePostId: string | null = null;
  if (req.body.caption && mod.sanitized) {
    const created = await insertModeratedPost(req.authUser!.id, 'SHARE', mod.sanitized, 'PUBLIC', null);
    sharePostId = created.postId;
    await sql`UPDATE posts SET shared_post_id = ${original.id} WHERE id = ${sharePostId}`;
  }

  const rows = await sql`
    INSERT INTO shares (post_id, user_id, caption, target, target_id, target_key, share_post_id)
    VALUES (${original.id}, ${req.authUser!.id}, ${mod.sanitized}, ${req.body.target},
            ${req.body.targetId ?? null}, ${targetKey}, ${sharePostId})
    RETURNING *`;

  await notify({
    userId: original.author_id, actorId: req.authUser!.id, type: 'SHARE',
    entityType: 'post', entityId: original.id,
  });
  await audit(req.authUser!.id, 'POST_SHARED', 'post', original.id, { target: req.body.target });
  res.status(201).json({ share: rows[0], sharePostId });
}));

/** POST /posts/:id/vote — poll voting (one vote per option; single-choice enforced). */
router.post('/:id/vote', requireAuth, requireVerifiedEmail, validateBody(z.object({
  optionId: z.string().uuid(),
})), asyncHandler(async (req, res) => {
  const post = await fetchPostById(String(req.params.id));
  if (!post || post.status !== 'ACTIVE' || post.type !== 'POLL') throw ApiError.notFound('Poll not found');
  const polls = await sql`SELECT * FROM polls WHERE post_id = ${post.id}`;
  const poll = polls[0];
  if (!poll) throw ApiError.notFound('Poll not found');
  if (poll.ends_at && new Date(poll.ends_at) < new Date()) throw ApiError.badRequest('This poll has ended');

  const opts = await sql`SELECT * FROM poll_options WHERE id = ${req.body.optionId} AND poll_id = ${poll.id}`;
  if (opts.length === 0) throw ApiError.badRequest('Invalid poll option');

  if (!poll.multiple) {
    await sql`DELETE FROM poll_votes WHERE poll_id = ${poll.id} AND user_id = ${req.authUser!.id}`;
  }
  try {
    await sql`
      INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES (${poll.id}, ${req.body.optionId}, ${req.authUser!.id})`;
  } catch (e: any) {
    if (String(e?.code) === '23505') return res.json({ voted: true, changed: false });
    throw e;
  }
  const results = await sql`
    SELECT opt.id, opt.label, (SELECT count(*) FROM poll_votes v WHERE v.option_id = opt.id) AS votes
    FROM poll_options opt WHERE opt.poll_id = ${poll.id} ORDER BY opt.position`;
  res.status(201).json({
    voted: true,
    options: results.map((r) => ({ id: r.id, label: r.label, votes: Number(r.votes) })),
  });
}));

/** GET /posts/:id/reactions — who reacted (real records). */
router.get('/:id/reactions', asyncHandler(async (req, res) => {
  const items = await sql`
    SELECT r.type, r.created_at, u.id, u.username, u.full_name, p.avatar_url
    FROM reactions r JOIN users u ON u.id = r.user_id LEFT JOIN profiles p ON p.user_id = u.id
    WHERE r.post_id = ${String(req.params.id)}
    ORDER BY r.created_at DESC LIMIT 100`;
  res.json({ items });
}));

export default router;
