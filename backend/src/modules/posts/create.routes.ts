import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../../db/client.js';
import { asyncHandler } from '../../utils/http.js';
import { ApiError } from '../../utils/errors.js';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth.js';
import { moderateText } from '../../services/moderation.js';
import { audit } from '../../services/audit.js';
import { notify } from '../../services/notifications.js';
import { storage, validateMime, kindFromMime, assertSize, tryThumbnail } from '../../services/media.js';
import { upload } from '../../middleware/upload.js';
import { hydratePosts, fetchPostById, POST_SELECT } from './helpers.js';

const router = Router();

const createSchema = z.object({
  type: z.enum(['TEXT', 'PHOTO', 'VIDEO', 'POLL', 'ANNOUNCEMENT']).default('TEXT'),
  content: z.string().max(8000).default(''),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS', 'GROUP', 'PRIVATE']).default('PUBLIC'),
  groupId: z.string().uuid().optional(),
  poll: z.object({
    question: z.string().min(3).max(300),
    multiple: z.boolean().default(false),
    endsInHours: z.number().int().min(1).max(720).optional(),
    options: z.array(z.string().min(1).max(120)).min(2).max(10),
  }).optional(),
});

/** Insert a post row with moderation applied; returns { postId, mod } or throws. */
export async function insertModeratedPost(
  authorId: string, type: string, content: string, visibility: string, groupId: string | null,
) {
  const mod = await moderateText(content);
  if (mod.status === 'REJECTED') {
    throw ApiError.badRequest('This content violates our community standards', { flags: mod.flags });
  }
  const rows = await sql`
    INSERT INTO posts (author_id, type, content, visibility, group_id, status, moderation)
    VALUES (${authorId}, ${type}, ${mod.sanitized}, ${visibility}, ${groupId},
            ${mod.status === 'PENDING_REVIEW' ? 'PENDING_REVIEW' : 'ACTIVE'},
            ${JSON.stringify({ flags: mod.flags })}::jsonb)
    RETURNING id`;
  return { postId: rows[0].id as string, mod };
}

router.post('/', requireAuth, requireVerifiedEmail, asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest('Validation failed', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const b = parsed.data;
  if (!b.content.trim() && b.type === 'TEXT') throw ApiError.badRequest('Post content is required');
  if (b.type === 'POLL' && !b.poll) throw ApiError.badRequest('Poll posts require poll options');
  if (b.groupId) {
    const m = await sql`
      SELECT 1 FROM group_members WHERE group_id = ${b.groupId} AND user_id = ${req.authUser!.id} AND status = 'ACTIVE'`;
    if (m.length === 0) throw ApiError.forbidden('Join the group before posting in it');
  }

  const { postId, mod } = await insertModeratedPost(
    req.authUser!.id, b.type, b.content, b.visibility, b.groupId ?? null);

  if (b.poll) {
    const pollRows = await sql`
      INSERT INTO polls (post_id, question, multiple, ends_at)
      VALUES (${postId}, ${b.poll.question}, ${b.poll.multiple},
              ${b.poll.endsInHours ? new Date(Date.now() + b.poll.endsInHours * 3600_000) : null})
      RETURNING id`;
    let pos = 0;
    for (const label of b.poll.options) {
      await sql`INSERT INTO poll_options (poll_id, label, position) VALUES (${pollRows[0].id}, ${label}, ${pos++})`;
    }
  }

  if (mod.status === 'PENDING_REVIEW') {
    await audit(req.authUser!.id, 'CONTENT_FLAGGED', 'post', postId, { flags: mod.flags });
    await notify({
      userId: req.authUser!.id, type: 'MODERATION', entityType: 'post', entityId: postId,
      body: 'Your post is under review by our moderators.',
    });
  }
  const hydrated = await hydratePosts([await fetchPostById(postId)], req.authUser!.id);
  res.status(201).json({ post: hydrated[0] });
}));

/** Multipart post with up to 6 images/videos. */
router.post('/media', requireAuth, requireVerifiedEmail, upload.array('media', 6), asyncHandler(async (req, res) => {
  const content = String(req.body?.content ?? '').slice(0, 8000);
  const visibility = ['PUBLIC', 'FOLLOWERS', 'GROUP', 'PRIVATE'].includes(String(req.body?.visibility))
    ? String(req.body.visibility) : 'PUBLIC';
  const groupId = req.body?.groupId && z.string().uuid().safeParse(req.body.groupId).success
    ? String(req.body.groupId) : null;
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (files.length === 0 && !content.trim()) throw ApiError.badRequest('Add content or media');

  const { postId, mod } = await insertModeratedPost(req.authUser!.id, 'PHOTO', content, visibility, groupId);
  let hasVideo = false;
  let position = 0;
  for (const file of files) {
    const kind = kindFromMime(file.mimetype);
    validateMime(file.mimetype, kind);
    assertSize(file.size);
    if (kind === 'VIDEO') hasVideo = true;
    const saved = await storage.save(file.buffer, file.originalname, file.mimetype);
    let thumbUrl: string | null = null;
    if (kind === 'IMAGE') {
      try {
        const t = await tryThumbnail(file.buffer);
        if (t.thumb) thumbUrl = (await storage.save(t.thumb, 'thumb.jpg', 'image/jpeg')).url;
      } catch { /* thumbnails optional */ }
    }
    await sql`
      INSERT INTO post_media (post_id, media_type, url, thumb_url, position, alt_text)
      VALUES (${postId}, ${kind}, ${saved.url}, ${thumbUrl}, ${position++}, ${content.slice(0, 120) || null})`;
  }
  if (hasVideo) await sql`UPDATE posts SET type = 'VIDEO' WHERE id = ${postId}`;
  if (mod.status === 'PENDING_REVIEW') {
    await notify({
      userId: req.authUser!.id, type: 'MODERATION', entityType: 'post', entityId: postId,
      body: 'Your post is under review by our moderators.',
    });
  }
  const hydrated = await hydratePosts([await fetchPostById(postId)], req.authUser!.id);
  res.status(201).json({ post: hydrated[0] });
}));

export default router;
