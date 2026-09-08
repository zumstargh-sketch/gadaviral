import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { asyncHandler, validateBody, parsePagination, paginated } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { moderateText } from '../services/moderation.js';
import { notify } from '../services/notifications.js';
import { emitToUser } from '../services/sockets.js';

const router = Router();

/** GET /messages/conversations/:id — message history. */
router.get('/conversations/:id', requireAuth, asyncHandler(async (req, res) => {
  const conversationId = String(req.params.id);
  const member = await sql`
    SELECT 1 FROM conversation_participants WHERE conversation_id = ${conversationId} AND user_id = ${req.authUser!.id}`;
  if (member.length === 0) throw ApiError.forbidden('Not a participant');
  const { page, limit, offset } = parsePagination(req.query, { page: 1, limit: 50 });
  const [items, count] = await Promise.all([
    sql`
      SELECT m.*, u.username AS sender_username, u.full_name AS sender_name
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ${conversationId} AND m.status = 'SENT'
      ORDER BY m.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*) AS n FROM messages WHERE conversation_id = ${conversationId} AND status = 'SENT'`,
  ]);
  await sql`
    UPDATE conversation_participants SET last_read_at = now()
    WHERE conversation_id = ${conversationId} AND user_id = ${req.authUser!.id}`;
  res.json(paginated(items.reverse(), Number(count[0].n), page, limit));
}));

/** POST /messages/conversations/:id — send a message (moderated, realtime). */
router.post('/conversations/:id', requireAuth, requireVerifiedEmail, validateBody(z.object({
  content: z.string().min(1).max(5000),
})), asyncHandler(async (req, res) => {
  const conversationId = String(req.params.id);
  const members = await sql`
    SELECT user_id FROM conversation_participants WHERE conversation_id = ${conversationId}`;
  if (!members.some((m: any) => m.user_id === req.authUser!.id)) throw ApiError.forbidden('Not a participant');
  const others = members.map((m: any) => m.user_id).filter((id: string) => id !== req.authUser!.id);

  const blocked = others.length > 0 ? await sql`
    SELECT 1 FROM blocks WHERE blocker_id = ANY(${sql.array(others)}::uuid[]) AND blocked_id = ${req.authUser!.id}` : [];
  if (blocked.length > 0) throw ApiError.forbidden('This person is not accepting messages from you');

  const mod = await moderateText(req.body.content);
  if (mod.status === 'REJECTED') throw ApiError.badRequest('This message violates our community standards');

  const rows = await sql`
    INSERT INTO messages (conversation_id, sender_id, content, flagged)
    VALUES (${conversationId}, ${req.authUser!.id}, ${mod.sanitized}, ${mod.status === 'PENDING_REVIEW'})
    RETURNING *`;
  await sql`UPDATE conversations SET last_message_at = now() WHERE id = ${conversationId}`;
  const payload = { ...rows[0], sender_username: req.authUser!.username, sender_name: req.authUser!.full_name };
  for (const otherId of others) {
    emitToUser(otherId, 'message', payload);
    await notify({
      userId: otherId, actorId: req.authUser!.id, type: 'MESSAGE',
      entityType: 'conversation', entityId: conversationId,
      body: mod.sanitized.slice(0, 80),
    });
  }
  res.status(201).json({ message: payload });
}));

export default router;
