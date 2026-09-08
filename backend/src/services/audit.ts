import type { Request } from 'express';
import { sql } from '../db/client.js';

/** Append-only audit trail for security-relevant and admin actions. */
export async function audit(
  actorId: string | null,
  action: string,
  entityType?: string,
  entityId?: string | null,
  meta: Record<string, unknown> = {},
  req?: Request,
) {
  await sql`
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, meta, ip, user_agent)
    VALUES (${actorId}, ${action}, ${entityType ?? null}, ${entityId ?? null},
            ${JSON.stringify(meta)}::jsonb,
            ${req?.ip ?? null}, ${(req?.headers['user-agent'] as string) ?? null})`;
}
