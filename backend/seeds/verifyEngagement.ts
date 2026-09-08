import { sql } from '../src/db/client.js';
import type { VerifyIssue } from './verify.js';

/** Automated final demo-data validation, part 2 (spec §98). */
export async function verifyEngagement(): Promise<VerifyIssue[]> {
  const issues: VerifyIssue[] = [];
  const add = (check: string, ok: boolean, detail: string) => issues.push({ check, ok, detail });
  const over = async (label: string, query: any, cap: number) => {
    const r: any[] = await query;
    add(label, Number(r[0]?.n ?? 0) === 0, `${r[0]?.n ?? 0} violations (cap ${cap})`);
  };

  await over('reaction-cap-70', sql`
    SELECT count(*) AS n FROM (SELECT post_id FROM reactions WHERE is_demo = true
      GROUP BY post_id HAVING count(*) > 70) x`, 70);
  await over('comment-cap-25', sql`
    SELECT count(*) AS n FROM (SELECT post_id FROM comments WHERE is_demo = true
      GROUP BY post_id HAVING count(*) > 25) x`, 25);
  await over('reply-cap-12', sql`
    SELECT count(*) AS n FROM (SELECT post_id FROM comments WHERE is_demo = true
      AND parent_comment_id IS NOT NULL GROUP BY post_id HAVING count(*) > 12) x`, 12);
  await over('share-cap-20', sql`
    SELECT count(*) AS n FROM (SELECT post_id FROM shares WHERE is_demo = true
      GROUP BY post_id HAVING count(*) > 20) x`, 20);
  await over('view-cap-400', sql`
    SELECT count(*) AS n FROM (SELECT post_id FROM post_views WHERE is_demo = true
      GROUP BY post_id HAVING count(*) > 400) x`, 400);

  await over('daily-reaction-cap-15', sql`
    SELECT count(*) AS n FROM (SELECT user_id, created_at::date AS d FROM reactions WHERE is_demo = true
      GROUP BY user_id, created_at::date HAVING count(*) > 15) x`, 15);
  await over('daily-comment-cap-5', sql`
    SELECT count(*) AS n FROM (SELECT author_id AS user_id, created_at::date AS d FROM comments WHERE is_demo = true
      GROUP BY author_id, created_at::date HAVING count(*) > 5) x`, 5);
  await over('daily-share-cap-4', sql`
    SELECT count(*) AS n FROM (SELECT user_id, created_at::date AS d FROM shares WHERE is_demo = true
      GROUP BY user_id, created_at::date HAVING count(*) > 4) x`, 4);

  // Festival ownership (§60)
  const mismatch = await sql`
    SELECT count(*) AS n FROM posts p
    JOIN users u ON u.id = p.author_id JOIN profiles pr ON pr.user_id = u.id
    WHERE p.is_demo = true AND p.moderation->>'seedFestival' IS NOT NULL
      AND (
        (p.moderation->>'seedGroup' = 'GA' AND pr.ethnic_group <> 'GA') OR
        (p.moderation->>'seedGroup' = 'DANGME' AND pr.ethnic_group = 'GA')
      )`;
  add('festival-associations-correct', Number(mismatch[0].n) === 0,
    `${mismatch[0].n} festival posts owned by the wrong cultural group`);

  // Follow range 10-35 (§67)
  const fr = await sql`
    SELECT count(*) AS n FROM (SELECT follower_id FROM follows WHERE is_demo = true
      GROUP BY follower_id HAVING count(*) < 10 OR count(*) > 35) x`;
  add('follows-range-10-35', Number(fr[0].n) === 0, `${fr[0].n} users outside 10-35`);

  // Identifiability (§83)
  const untagged = await sql`
    SELECT
      (SELECT count(*) FROM posts WHERE author_id IN (SELECT id FROM users WHERE is_demo = true) AND is_demo = false) AS p,
      (SELECT count(*) FROM reactions WHERE user_id IN (SELECT id FROM users WHERE is_demo = true) AND is_demo = false) AS r,
      (SELECT count(*) FROM comments WHERE author_id IN (SELECT id FROM users WHERE is_demo = true) AND is_demo = false) AS c`;
  add('demo-rows-identifiable',
    Number(untagged[0].p) === 0 && Number(untagged[0].r) === 0 && Number(untagged[0].c) === 0,
    `Untagged: posts=${untagged[0].p} reactions=${untagged[0].r} comments=${untagged[0].c}`);

  const meta = await sql`SELECT batch FROM demo_seed_metadata WHERE wiped_at IS NULL`;
  add('seed-batch-recorded', meta.length === 1,
    meta.length === 1 ? `Active batch ${meta[0].batch}` : `${meta.length} active batches`);

  return issues;
}
