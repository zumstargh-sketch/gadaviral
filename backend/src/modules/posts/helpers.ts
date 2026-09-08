import { sql } from '../../db/client.js';

export const POST_SELECT = sql`
  p.id, p.author_id, p.type, p.content, p.visibility, p.group_id, p.status, p.is_demo,
  p.reaction_count, p.comment_count, p.share_count, p.view_count,
  p.shared_post_id, p.created_at, p.edited_at,
  u.username AS author_username, u.full_name AS author_name, u.is_demo AS author_is_demo,
  pr.avatar_url AS author_avatar
`;

/** Hydrate a page of posts with media + poll + viewer state (batched, no N+1). */
export async function hydratePosts(posts: any[], viewerId?: string | null) {
  if (posts.length === 0) return posts;
  const ids = posts.map((p) => p.id);
  const [media, polls, shared] = await Promise.all([
    sql`SELECT id, post_id, media_type, url, thumb_url, alt_text, position
        FROM post_media WHERE post_id IN ${sql(ids)} ORDER BY position`,
    sql`SELECT pl.post_id, pl.id AS poll_id, pl.question, pl.multiple, pl.ends_at,
               opt.id AS option_id, opt.label,
               (SELECT count(*) FROM poll_votes v WHERE v.option_id = opt.id) AS votes
        FROM polls pl
        JOIN poll_options opt ON opt.poll_id = pl.id
        WHERE pl.post_id IN ${sql(ids)}
        ORDER BY opt.position`,
    sql`SELECT sp.id, sp.content, sp.type, sp.created_at,
               su.username AS author_username, su.full_name AS author_name, pra.avatar_url AS author_avatar
        FROM posts p
        JOIN posts sp ON sp.id = p.shared_post_id
        JOIN users su ON su.id = sp.author_id
        LEFT JOIN profiles pra ON pra.user_id = su.id
        WHERE p.shared_post_id IS NOT NULL AND p.id IN ${sql(ids)}`,
  ]);
  let myReactions: any[] = [];
  if (viewerId) {
    myReactions = await sql`
      SELECT post_id, type FROM reactions
      WHERE user_id = ${viewerId} AND post_id IN ${sql(ids)}`;
  }
  const mediaByPost = new Map<string, any[]>();
  for (const m of media) {
    if (!mediaByPost.has(m.post_id)) mediaByPost.set(m.post_id, []);
    mediaByPost.get(m.post_id)!.push(m);
  }
  const pollByPost = new Map<string, any>();
  for (const row of polls) {
    if (!pollByPost.has(row.post_id)) {
      pollByPost.set(row.post_id, {
        id: row.poll_id, question: row.question, multiple: row.multiple,
        endsAt: row.ends_at, options: [], totalVotes: 0,
      });
    }
    const poll = pollByPost.get(row.post_id);
    poll.options.push({ id: row.option_id, label: row.label, votes: Number(row.votes) });
    poll.totalVotes += Number(row.votes);
  }
  const sharedById = new Map(shared.map((s) => [s.id, s]));
  const reactionByMe = new Map(myReactions.map((r) => [r.post_id, r.type]));
  return posts.map((p) => ({
    ...p,
    media: mediaByPost.get(p.id) ?? [],
    poll: pollByPost.get(p.id) ?? null,
    sharedPost: p.shared_post_id ? sharedById.get(p.shared_post_id) ?? null : null,
    viewer: { reaction: reactionByMe.get(p.id) ?? null },
  }));
}

export async function fetchPostById(postId: string) {
  const rows = await sql`
    SELECT ${POST_SELECT} FROM posts p
    JOIN users u ON u.id = p.author_id LEFT JOIN profiles pr ON pr.user_id = u.id
    WHERE p.id = ${postId}`;
  return rows[0] ?? null;
}

export async function canSeePost(post: any, viewerId: string | null, viewerRole?: string) {
  if (post.status !== 'ACTIVE') {
    return Boolean(viewerRole && ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(viewerRole));
  }
  if (post.author_id === viewerId) return true;
  if (post.visibility === 'PUBLIC') return true;
  if (!viewerId) return false;
  if (post.visibility === 'FOLLOWERS') {
    const f = await sql`SELECT 1 FROM follows WHERE follower_id = ${viewerId} AND followee_id = ${post.author_id}`;
    return f.length > 0;
  }
  if (post.visibility === 'GROUP' && post.group_id) {
    const m = await sql`
      SELECT 1 FROM group_members WHERE group_id = ${post.group_id} AND user_id = ${viewerId} AND status = 'ACTIVE'`;
    return m.length > 0;
  }
  return false;
}

/** True when the viewer has blocked/muted the author (feeds exclude these). */
export async function excludedAuthorFilter(viewerId: string | null): Promise<string[] | null> {
  if (!viewerId) return null;
  const rows = await sql`
    SELECT blocked_id AS id FROM blocks WHERE blocker_id = ${viewerId}
    UNION
    SELECT muted_id AS id FROM mutes WHERE user_id = ${viewerId}
      AND (until_at IS NULL OR until_at > now())`;
  return rows.map((r) => r.id);
}
