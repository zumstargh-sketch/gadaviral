import { sql } from '../db/client.js';
import { emitToUser } from './sockets.js';

export type NotificationType =
  | 'REACTION' | 'COMMENT' | 'REPLY' | 'SHARE' | 'FOLLOW' | 'MESSAGE'
  | 'EVENT' | 'SYSTEM' | 'MODERATION' | 'GROUP';

interface CreateNotificationInput {
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  entityType?: string;
  entityId?: string | null;
  body?: string;
  isDemo?: boolean;
  seedBatch?: string | null;
  createdAt?: Date;
}

/** Persist a notification (real row) and push it over the socket in realtime. */
export async function notify(input: CreateNotificationInput) {
  if (input.actorId && input.actorId === input.userId) return; // never self-notify
  const rows = await sql`
    INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, body, is_demo, seed_batch, created_at)
    VALUES (${input.userId}, ${input.actorId ?? null}, ${input.type}, ${input.entityType ?? null},
            ${input.entityId ?? null}, ${input.body ?? null}, ${input.isDemo ?? false}, ${input.seedBatch ?? null},
            ${input.createdAt ?? new Date()})
    RETURNING *`;
  const row = rows[0];
  emitToUser(input.userId, 'notification', row);
  return row;
}

export async function markRead(userId: string, ids?: string[]) {
  if (ids && ids.length > 0) {
    await sql`UPDATE notifications SET read_at = now()
              WHERE user_id = ${userId} AND read_at IS NULL AND id = ANY(${sql.array(ids)})`;
  } else {
    await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${userId} AND read_at IS NULL`;
  }
}
