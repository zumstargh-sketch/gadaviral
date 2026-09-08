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

/** GET /messages/conversations — inbox with last message + unread count. */
router.get('/conversations', requireAuth, asyncHandler(async (req, res) => {
  const rows = await sql`
    SELECT c.id, c.is_group, c.title, c.last_message_at,
      (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
      (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id
         AND m.created_at > COALESCE(cp.last_read_at, to_timestamp(0)) AND m.sender_id <> ${req.authUser!.id}) AS unread,
      other.id AS other_user_id, other.username AS other_username, other.full_name AS other_name,
      p.avatar_url AS other_avatar, other.is_demo AS other_is_demo
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    LEFT JOIN LATERAL (
      SELECT u.* FROM conversation_participants cp2
      JOIN users u ON u.id = cp2.user_id
      WHERE cp2.conversation_id = c.id AND cp2.user_id <> ${req.authUser!.id}
      LIMIT 1
    ) other ON true
    LEFT JOIN profiles p ON p.user_id = other.id
    WHERE cp.user_id = ${req.authUser!.id}
    ORDER BY c.last_message_at DESC NULLS LAST
    LIMIT 100`;
  res.json({ items: rows });
}));

/** POST /messages/conversations — start (or fetch) a 1:1 conversation. */
router.post('/conversations', requireAuth, requireVerifiedEmail, validateBody(z.object({
  username: z.string().min(3).max(30),
})), asyncHandler(async (req, res) => {
  const target = await sql`
    SELECT id FROM users WHERE username = ${String(req.body.username).toLowerCase()} AND deleted_at IS NULL`;
  if (target.length === 0) throw ApiError.notFound('User not found');
  const otherId = target[0].id;
  if (otherId === req.authUser!.id) throw ApiError.badRequest('You cannot message yourself');
  const blocked = await sql`
    SELECT 1 FROM blocks WHERE (blocker_id = ${req.authUser!.id} AND blocked_id = ${otherId})
                            OR (blocker_id = ${otherId} AND blocked_id = ${req.authUser!.id})`;
  if (blocked.length > 0) throw ApiError.forbidden('Messaging is unavailable between these accounts');

  const existing = await sql`
    SELECT c.id FROM conversations c
    JOIN conversation_participants a ON a.conversation_id = c.id AND a.user_id = ${req.authUser!.id}
    JOIN conversation_participants b ON b.conversation_id = c.id AND b.user_id = ${otherId}
    WHERE c.is_group = false LIMIT 1`;
  if (existing.length > 0) return res.json({ conversationId: existing[0].id });

  const created = await sql`
    INSERT INTO conversations (created_by) VALUES (${req.authUser!.id}) RETURNING id`;
  await sql`
    INSERT INTO conversation_participants (conversation_id, user_id)
    VALUES (${created[0].id}, ${req.authUser!.id}), (${created[0].id}, ${otherId})`;
  res.status(201).json({ conversationId: created[0].id });
}));

export default router;
