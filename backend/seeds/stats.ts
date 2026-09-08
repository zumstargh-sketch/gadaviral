import { sql } from '../src/db/client.js';

/** Demo analytics for the admin dashboard (spec §87). */
export async function demoStats() {
  const [users, posts, comments, reactions, shares, views, follows, notifications, meta] =
    await Promise.all([
      sql`SELECT count(*) AS n FROM users WHERE is_demo = true`,
      sql`SELECT count(*) AS n FROM posts WHERE is_demo = true`,
      sql`SELECT count(*) AS n FROM comments WHERE is_demo = true`,
      sql`SELECT count(*) AS n FROM reactions WHERE is_demo = true`,
      sql`SELECT count(*) AS n FROM shares WHERE is_demo = true`,
      sql`SELECT count(*) AS n FROM post_views WHERE is_demo = true`,
      sql`SELECT count(*) AS n FROM follows WHERE is_demo = true`,
      sql`SELECT count(*) AS n FROM notifications WHERE is_demo = true`,
      sql`SELECT batch, started_at, completed_at, wiped_at FROM demo_seed_metadata ORDER BY started_at DESC LIMIT 5`,
    ]);
  return {
    users: Number(users[0].n),
    posts: Number(posts[0].n),
    comments: Number(comments[0].n),
    reactions: Number(reactions[0].n),
    shares: Number(shares[0].n),
    views: Number(views[0].n),
    follows: Number(follows[0].n),
    notifications: Number(notifications[0].n),
    batches: meta,
  };
}

const invoked = process.argv[1] && process.argv[1].includes('stats');
if (invoked) {
  demoStats().then(async (s) => {
    console.log(JSON.stringify(s, null, 2));
    await sql.end();
  });
}
