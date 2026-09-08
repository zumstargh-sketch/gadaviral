import { sql } from '../src/db/client.js';

/**
 * Demo wipe (spec §85, §101): deletes ONLY demo-tagged rows.
 * Real users and real content are never touched.
 */
export async function wipeDemoData(batch?: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const demoUserIds = sql`SELECT id FROM users WHERE is_demo = true`;

  counts.notifications =
    (await sql`DELETE FROM notifications WHERE is_demo = true RETURNING id`).length
    + (await sql`
      DELETE FROM notifications n WHERE n.is_demo = false AND (
        n.user_id IN (${demoUserIds}) OR n.actor_id IN (${demoUserIds})) RETURNING id`).length;

  counts.poll_votes = (await sql`DELETE FROM poll_votes WHERE is_demo = true RETURNING id`).length;

  counts.messages = (await sql`DELETE FROM messages WHERE is_demo = true RETURNING id`).length;
  await sql`DELETE FROM conversation_participants WHERE user_id IN (${demoUserIds})`;
  await sql`
    DELETE FROM conversations c WHERE c.is_demo = true AND NOT EXISTS (
      SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id AND cp.is_demo = false)`;

  counts.comments = (await sql`DELETE FROM comments WHERE is_demo = true RETURNING id`).length;
  counts.reactions = (await sql`DELETE FROM reactions WHERE is_demo = true RETURNING id`).length;
  counts.shares = (await sql`DELETE FROM shares WHERE is_demo = true RETURNING id`).length;
  counts.views = (await sql`DELETE FROM post_views WHERE is_demo = true RETURNING id`).length;

  counts.group_members =
    (await sql`DELETE FROM group_members WHERE is_demo = true RETURNING group_id`).length
    + (await sql`
      DELETE FROM group_members WHERE user_id IN (${demoUserIds}) RETURNING group_id`).length;
  counts.event_members =
    (await sql`DELETE FROM event_members WHERE is_demo = true RETURNING event_id`).length
    + (await sql`
      DELETE FROM event_members WHERE user_id IN (${demoUserIds}) RETURNING event_id`).length;
  counts.page_followers =
    (await sql`DELETE FROM page_followers WHERE is_demo = true RETURNING page_id`).length
    + (await sql`
      DELETE FROM page_followers WHERE user_id IN (${demoUserIds}) RETURNING page_id`).length;

  counts.follows =
    (await sql`DELETE FROM follows WHERE is_demo = true RETURNING follower_id`).length
    + (await sql`
      DELETE FROM follows WHERE follower_id IN (${demoUserIds}) OR followee_id IN (${demoUserIds})
      RETURNING follower_id`).length;

  counts.posts = (await sql`DELETE FROM posts WHERE is_demo = true RETURNING id`).length;
  counts.businesses = (await sql`DELETE FROM businesses WHERE is_demo = true RETURNING id`).length;
  counts.events = (await sql`DELETE FROM events WHERE is_demo = true RETURNING id`).length;
  counts.groups = (await sql`DELETE FROM groups WHERE is_demo = true RETURNING id`).length;
  counts.pages = (await sql`DELETE FROM pages WHERE is_demo = true RETURNING id`).length;

  counts.users = (await sql`DELETE FROM users WHERE is_demo = true RETURNING id`).length;

  if (batch) {
    await sql`UPDATE demo_seed_metadata SET wiped_at = now() WHERE batch = ${batch}`;
  } else {
    await sql`UPDATE demo_seed_metadata SET wiped_at = now() WHERE wiped_at IS NULL`;
  }
  await renormaliseCounters();
  return counts;
}

/** Re-derive denormalised counters from their source rows (data integrity). */
export async function renormaliseCounters() {
  await sql`
    UPDATE posts p SET reaction_count = sub.n FROM
      (SELECT post_id, count(*) AS n FROM reactions GROUP BY post_id) sub
    WHERE p.id = sub.post_id AND p.reaction_count <> sub.n`;
  await sql`
    UPDATE posts p SET comment_count = sub.n FROM
      (SELECT post_id, count(*) AS n FROM comments WHERE status = 'ACTIVE' GROUP BY post_id) sub
    WHERE p.id = sub.post_id AND p.comment_count <> sub.n`;
  await sql`
    UPDATE posts p SET share_count = sub.n FROM
      (SELECT post_id, count(*) AS n FROM shares GROUP BY post_id) sub
    WHERE p.id = sub.post_id AND p.share_count <> sub.n`;
  await sql`
    UPDATE posts p SET view_count = sub.n FROM
      (SELECT post_id, count(*) AS n FROM post_views GROUP BY post_id) sub
    WHERE p.id = sub.post_id AND p.view_count <> sub.n`;
  await sql`
    UPDATE users u SET follower_count = sub.n FROM
      (SELECT followee_id, count(*) AS n FROM follows GROUP BY followee_id) sub
    WHERE u.id = sub.followee_id AND u.follower_count <> sub.n`;
  await sql`
    UPDATE users u SET posts_count = sub.n FROM
      (SELECT author_id, count(*) AS n FROM posts WHERE status = 'ACTIVE' GROUP BY author_id) sub
    WHERE u.id = sub.author_id AND u.posts_count <> sub.n`;
}
