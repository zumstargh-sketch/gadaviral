import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { asyncHandler, validateBody } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { moderateText } from '../services/moderation.js';
import { audit } from '../services/audit.js';

const router = Router();

export const PROFILE_SELECT = sql`
  u.id, u.username, u.full_name, u.role, u.status, u.email_verified, u.auth_provider,
  u.is_demo, u.follower_count, u.following_count, u.posts_count, u.created_at,
  p.avatar_url, p.cover_url, p.bio, p.gender, p.location, p.hometown, p.community,
  p.ethnic_group, p.occupation, p.education, p.interests, p.languages
`;

export const isPrivileged = (req: any) =>
  ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(req.authUser?.role ?? 'USER');

/** GET /users/:username — public profile. */
router.get('/:username', optionalAuth, asyncHandler(async (req, res) => {
  const username = String(req.params.username).toLowerCase();
  const rows = await sql`
    SELECT ${PROFILE_SELECT} FROM users u LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.username = ${username} AND u.deleted_at IS NULL`;
  const user = rows[0];
  if (!user) throw ApiError.notFound('User not found');

  if (req.authUser && req.authUser.id !== user.id && !isPrivileged(req)) {
    const blockedMe = await sql`
      SELECT 1 FROM blocks WHERE blocker_id = ${user.id} AND blocked_id = ${req.authUser.id}`;
    if (blockedMe.length > 0) throw ApiError.forbidden('This profile is unavailable');
  }

  let following = false, followsYou = false;
  if (req.authUser && req.authUser.id !== user.id) {
    following = (await sql`
      SELECT 1 FROM follows WHERE follower_id = ${req.authUser.id} AND followee_id = ${user.id}`).length > 0;
    followsYou = (await sql`
      SELECT 1 FROM follows WHERE follower_id = ${user.id} AND followee_id = ${req.authUser.id}`).length > 0;
  }
  const isSelf = req.authUser?.id === user.id;
  const result: any = { ...user };
  if (!isSelf && !isPrivileged(req)) delete result.email_verified;
  res.json({ user: result, viewer: { following, followsYou, isSelf } });
}));

const os = (max = 120) => z.string().max(max).nullish();
const ETHNIC = ['GA', 'DANGME', 'KROBO', 'ADA', 'SHAI', 'NINGO', 'PRAMPRAM', 'OSUDOKU', 'OTHER', 'UNSPECIFIED'] as const;

const updateSchema = z.object({
  fullName: z.string().min(2).max(80).optional(),
  bio: z.string().max(600).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullish(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  location: os(), hometown: os(), community: os(),
  ethnicGroup: z.enum(ETHNIC).nullish(),
  occupation: os(), education: os(160),
  interests: z.array(z.string().max(40)).max(20).optional(),
  languages: z.array(z.string().max(40)).max(20).optional(),
  privacy: z.record(z.string(), z.any()).optional(),
  notificationPrefs: z.record(z.string(), z.any()).optional(),
});

/** PATCH /users/me — edit own profile (moderated bio). */
router.patch('/me', requireAuth, validateBody(updateSchema), asyncHandler(async (req, res) => {
  const userId = req.authUser!.id;
  const b = req.body as any;
  if (b.fullName !== undefined) {
    await sql`UPDATE users SET full_name = ${b.fullName} WHERE id = ${userId}`;
  }
  if (b.bio !== undefined) {
    const mod = await moderateText(b.bio);
    if (mod.status === 'REJECTED') throw ApiError.badRequest('Your bio contains prohibited content', { flags: mod.flags });
    await sql`UPDATE profiles SET bio = ${mod.sanitized} WHERE user_id = ${userId}`;
  }
  const sets: string[] = [];
  const vals: any[] = [];
  const map: Record<string, string> = {
    gender: 'gender', dateOfBirth: 'date_of_birth', location: 'location', hometown: 'hometown',
    community: 'community', ethnicGroup: 'ethnic_group', occupation: 'occupation', education: 'education',
  };
  for (const [k, col] of Object.entries(map)) {
    if (b[k] !== undefined) { vals.push(b[k]); sets.push(`${col} = $${vals.length}`); }
  }
  if (b.interests !== undefined) { vals.push(b.interests); sets.push(`interests = $${vals.length}`); }
  if (b.languages !== undefined) { vals.push(b.languages); sets.push(`languages = $${vals.length}`); }
  if (b.privacy !== undefined) { vals.push(JSON.stringify(b.privacy)); sets.push(`privacy = profiles.privacy || $${vals.length}::jsonb`); }
  if (b.notificationPrefs !== undefined) { vals.push(JSON.stringify(b.notificationPrefs)); sets.push(`notification_prefs = profiles.notification_prefs || $${vals.length}::jsonb`); }
  if (sets.length > 0) {
    vals.push(userId);
    await sql.unsafe(`UPDATE profiles SET ${sets.join(', ')} WHERE user_id = $${vals.length}`, vals);
  }
  await audit(userId, 'PROFILE_UPDATED', 'user', userId);
  const rows = await sql`
    SELECT ${PROFILE_SELECT} FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ${userId}`;
  res.json({ user: rows[0] });
}));

export default router;
