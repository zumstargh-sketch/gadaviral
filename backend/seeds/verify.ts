import { sql } from '../src/db/client.js';

export interface VerifyIssue { check: string; ok: boolean; detail: string; }

/** Automated final demo-data validation, part 1 (spec §98). */
export async function verifyCore(): Promise<VerifyIssue[]> {
  const issues: VerifyIssue[] = [];
  const add = (check: string, ok: boolean, detail: string) => issues.push({ check, ok, detail });

  const users = await sql`SELECT count(*) AS n FROM users WHERE is_demo = true`;
  add('demo-user-count-117', Number(users[0].n) === 117,
    `Expected 117 demo users (116 Ga/Dangme + 1 generic), found ${users[0].n}`);

  const generic = await sql`SELECT count(*) AS n FROM users WHERE is_demo = true AND username = 'demo_tester'`;
  add('generic-demo-account', Number(generic[0].n) === 1, `Expected exactly 1, found ${generic[0].n}`);

  const gaDangme = await sql`
    SELECT count(*) AS n FROM users u JOIN profiles p ON p.user_id = u.id
    WHERE u.is_demo = true AND username <> 'demo_tester'
      AND p.ethnic_group IN ('GA','DANGME','KROBO','ADA','SHAI','NINGO','PRAMPRAM','OSUDOKU')`;
  add('ga-dangme-count-116', Number(gaDangme[0].n) === 116, `Expected 116, found ${gaDangme[0].n}`);

  const posts = await sql`SELECT count(*) AS n FROM posts WHERE is_demo = true`;
  add('posts-exactly-150', Number(posts[0].n) === 150, `Expected exactly 150, found ${posts[0].n}`);

  const range = await sql`SELECT min(created_at) AS f, max(created_at) AS l FROM posts WHERE is_demo = true`;
  const f = new Date(range[0].f), l = new Date(range[0].l);
  add('no-post-before-may-2026', f >= new Date('2026-05-01T00:00:00Z'), `Earliest: ${f.toISOString()}`);
  add('no-post-after-7-sep-2026', l <= new Date('2026-09-07T23:59:59Z'), `Latest: ${l.toISOString()}`);

  const future = await sql`
    SELECT count(*) AS n FROM (
      SELECT created_at AS t FROM reactions WHERE is_demo = true
      UNION ALL SELECT created_at FROM comments WHERE is_demo = true
      UNION ALL SELECT created_at FROM shares WHERE is_demo = true
      UNION ALL SELECT created_at FROM post_views WHERE is_demo = true
      UNION ALL SELECT created_at FROM follows WHERE is_demo = true
      UNION ALL SELECT created_at FROM notifications WHERE is_demo = true
    ) x WHERE t > now() + interval '2 minutes'`;
  add('no-future-interactions', Number(future[0].n) === 0, `${future[0].n} future-dated rows`);

  const dupU = await sql`SELECT username FROM users GROUP BY username HAVING count(*) > 1`;
  add('usernames-unique', dupU.length === 0, `${dupU.length} duplicates`);

  const dupR = await sql`
    SELECT post_id, user_id FROM reactions GROUP BY post_id, user_id HAVING count(*) > 1`;
  add('reactions-not-duplicated', dupR.length === 0, `${dupR.length} duplicate reactions`);

  const broken = await sql`
    SELECT count(*) AS n FROM reactions r
    LEFT JOIN posts p ON p.id = r.post_id LEFT JOIN users u ON u.id = r.user_id
    WHERE r.is_demo = true AND (p.id IS NULL OR u.id IS NULL)`;
  add('relationships-valid', Number(broken[0].n) === 0, `${broken[0].n} broken FKs`);

  const selfFollows = await sql`SELECT count(*) AS n FROM follows WHERE follower_id = followee_id`;
  add('no-self-follows', Number(selfFollows[0].n) === 0, `${selfFollows[0].n} self-follows`);

  return issues;
}
