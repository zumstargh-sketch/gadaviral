import { sql } from '../src/db/client.js';
import { uuid, randomInt, pick, shuffled } from '../src/utils/crypto.js';
import { buildIdentities, buildGenericDemoIdentity } from './userFactory.js';
import { insertDemoUser } from './demoDb.js';
import { wipeDemoData } from './demoWipe.js';
import { buildPostPlan, pickAuthorFor } from './demoPlan.js';
import { buildEngagement, type SeedUser, type PlannedPost } from './demoEngage.js';
import { buildFollows, buildGroupMemberships, buildEventMemberships } from './demoGraph.js';
import { savePostImage } from './media.js';
import { GROUP_SEEDS, EVENT_SEEDS, BUSINESS_SEEDS, PAGE_SEEDS } from './data/platform.js';
import { slugify } from '../src/modules/groups.routes.js';

export const DEMO_USER_COUNT = 116;
export const DEMO_DIASPORA_COUNT = 14;
export const DEMO_POST_COUNT = 150;

export interface SeedReport {
  batch: string; users: number; posts: number; follows: number;
  reactions: number; comments: number; replies: number; shares: number; views: number;
  pollVotes: number; groupMemberships: number; eventMemberships: number;
  notifications: number; messages: number;
  groups: number; events: number; businesses: number; pages: number;
}

/** Regenerate the entire demo dataset (spec §84). Pass force to wipe first. */
export async function seedDemo(opts: { force?: boolean } = {}): Promise<SeedReport> {
  const active = await sql`
    SELECT batch FROM demo_seed_metadata WHERE wiped_at IS NULL LIMIT 1`;
  if (active.length > 0 && !opts.force) {
    throw new Error(`Demo data already exists (batch ${active[0].batch}). Use --force to wipe and regenerate.`);
  }
  if (active.length > 0) await wipeDemoData();

  const batch = uuid();
  const report: SeedReport = {
    batch, users: 0, posts: 0, follows: 0, reactions: 0, comments: 0, replies: 0,
    shares: 0, views: 0, pollVotes: 0, groupMemberships: 0, eventMemberships: 0,
    notifications: 0, messages: 0, groups: 0, events: 0, businesses: 0, pages: 0,
  };
  await sql`INSERT INTO demo_seed_metadata (batch, label, created_by) VALUES (${batch}, 'DEMO/SEED DATA', 'seed-demo')`;

  // ── 1. Users: 116 Ga/Dangme + 1 generic DEMO account (§45, §65) ──
  const identities = buildIdentities(DEMO_USER_COUNT, DEMO_DIASPORA_COUNT);
  const generic = buildGenericDemoIdentity();
  const seedUsers: SeedUser[] = [];
  let avatarSeed = randomInt(1, 500);
  for (const identity of identities) {
    seedUsers.push({ id: await insertDemoUser(identity, batch, avatarSeed++), identity });
  }
  seedUsers.push({ id: await insertDemoUser(generic, batch, avatarSeed++), identity: generic });
  report.users = seedUsers.length;
  const genericUser = seedUsers[seedUsers.length - 1];

  // ── 2. Groups / Events / Pages / Businesses ──
  const groupIds: Array<{ id: string; affinity: 'GA' | 'DANGME' | 'ALL' }> = [];
  for (const [name, slug, description] of GROUP_SEEDS) {
    const affinity = /GA_|HOMOWO/.test(slug) ? 'GA'
      : /DANGME|NGMAYEM|ASAFOTUFIAM|DIPO/.test(slug) ? 'DANGME' : 'ALL';
    const owner = pick(seedUsers.filter((u) => u.identity.ethnic !== 'UNSPECIFIED'));
    const rows = await sql`
      INSERT INTO groups (slug, name, description, category, creator_id, is_demo, seed_batch, demo_source)
      VALUES (${slug.toLowerCase()}, ${name}, ${description},
              ${affinity === 'GA' ? 'GA_CULTURE' : affinity === 'DANGME' ? 'DANGME_CULTURE' : 'COMMUNITY'},
              ${owner.id}, true, ${batch}, 'seed-demo')
      RETURNING id`;
    groupIds.push({ id: rows[0].id, affinity });
    report.groups++;
  }

  const eventIds: Array<{ id: string; community: string; group: string; startsAt: Date }> = [];
  for (const ev of EVENT_SEEDS) {
    const organizer = pick(seedUsers.filter((u) =>
      ev.group === 'GA' ? u.identity.ethnic === 'GA'
        : u.identity.ethnic !== 'GA' && u.identity.ethnic !== 'UNSPECIFIED'));
    const startsAt = new Date(Date.UTC(2026, ev.month - 1, ev.day, 14 + randomInt(0, 6), randomInt(0, 59)));
    let slug = slugify(ev.title).slice(0, 55);
    if ((await sql`SELECT 1 FROM events WHERE slug = ${slug}`).length > 0) slug = `${slug}-${randomInt(100, 999)}`;
    const rows = await sql`
      INSERT INTO events (slug, title, description, category, starts_at, location, community,
                          organizer_id, seed_note, is_demo, seed_batch, demo_source)
      VALUES (${slug}, ${ev.title},
              ${'Fictional community event created as DEMO/SEED DATA. Not a confirmed real-world event.'},
              ${ev.category}, ${startsAt}, ${ev.location}, ${ev.community}, ${organizer.id},
              ${'DEMO/SEED DATA — fictional event'}, true, ${batch}, 'seed-demo')
      RETURNING id`;
    eventIds.push({ id: rows[0].id, community: ev.community, group: ev.group, startsAt });
    report.events++;
  }
  void EVENT_SEEDS;

  for (const [name, category, description] of BUSINESS_SEEDS) {
    const owner = pick(seedUsers.filter((u) => u.identity.ethnic !== 'UNSPECIFIED'));
    let slug = slugify(name);
    if ((await sql`SELECT 1 FROM businesses WHERE slug = ${slug}`).length > 0) slug = `${slug}-${randomInt(100, 999)}`;
    await sql`
      INSERT INTO businesses (slug, name, category, description, owner_id, area, verified,
                              is_demo, seed_batch, demo_source)
      VALUES (${slug}, ${name}, ${category}, ${description}, ${owner.id},
              ${owner.identity.hometown}, ${randomInt(0, 4) === 0}, true, ${batch}, 'seed-demo')`;
    report.businesses++;
  }

  for (const [name, category, description] of PAGE_SEEDS) {
    const owner = pick(seedUsers.filter((u) => u.identity.ethnic !== 'UNSPECIFIED'));
    let slug = slugify(name);
    if ((await sql`SELECT 1 FROM pages WHERE slug = ${slug}`).length > 0) slug = `${slug}-${randomInt(100, 999)}`;
    await sql`
      INSERT INTO pages (slug, name, category, description, owner_id, verified, is_demo, seed_batch, demo_source)
      VALUES (${slug}, ${name}, ${category}, ${description}, ${owner.id}, true, true, ${batch}, 'seed-demo')`;
    report.pages++;
  }

  return finishSeed(batch, report, { seedUsers, genericUser, groupIds, eventIds });
}

/** Phase 2: content, graph, engagement, metadata. */
async function finishSeed(
  batch: string,
  report: SeedReport,
  ctx: {
    seedUsers: SeedUser[];
    genericUser: SeedUser;
    groupIds: Array<{ id: string; affinity: 'GA' | 'DANGME' | 'ALL' }>;
    eventIds: Array<{ id: string; community: string; group: string; startsAt: Date }>;
  },
): Promise<SeedReport> {
  const { seedUsers, genericUser, groupIds, eventIds } = ctx;
  const gaIdentities = seedUsers.filter((u) => u.identity.ethnic === 'GA').map((u) => u.identity);
  const dangmeIdentities = seedUsers
    .filter((u) => u.identity.ethnic !== 'GA' && u.identity.ethnic !== 'UNSPECIFIED').map((u) => u.identity);
  const diasporaIdentities = seedUsers
    .filter((u) => u.identity.isDiaspora && u.identity.ethnic !== 'UNSPECIFIED').map((u) => u.identity);

  // ── 3. Exactly 150 posts with realistic timestamps (§54-57) ──
  const plan = buildPostPlan([...gaIdentities, ...dangmeIdentities]);
  if (plan.length !== DEMO_POST_COUNT) {
    throw new Error(`Post plan produced ${plan.length} posts, expected ${DEMO_POST_COUNT}`);
  }
  const authorUse = new Map<string, number>();
  const planned: PlannedPost[] = [];
  let mediaSeed = randomInt(1, 900);
  for (const item of plan) {
    const identity = pickAuthorFor(item, gaIdentities, dangmeIdentities, diasporaIdentities,
      genericUser.identity, authorUse);
    const author = seedUsers.find((u) => u.identity.username === identity.username)!;
    const moderation = JSON.stringify({
      flags: [], seedCategory: item.category,
      seedFestival: item.festival ?? null, seedGroup: item.festivalGroup ?? null,
    });
    const rows = await sql`
      INSERT INTO posts (author_id, type, content, visibility, status, moderation,
                         is_demo, seed_batch, demo_source, created_at)
      VALUES (${author.id}, ${item.type}, ${item.caption}, 'PUBLIC', 'ACTIVE', ${moderation}::jsonb,
              true, ${batch}, 'seed-demo', ${item.createdAt})
      RETURNING id`;
    const postId = rows[0].id as string;
    if (item.media) {
      const url = savePostImage(item.category, mediaSeed++);
      await sql`
        INSERT INTO post_media (post_id, media_type, url, position, alt_text, is_demo, seed_batch)
        VALUES (${postId}, ${item.media}, ${url}, 0, ${item.caption.slice(0, 100)}, true, ${batch})`;
    }
    if (item.poll) {
      const pollRows = await sql`
        INSERT INTO polls (post_id, question, is_demo, seed_batch)
        VALUES (${postId}, ${item.poll.question}, true, ${batch})
        RETURNING id`;
      let pos = 0;
      for (const label of item.poll.options) {
        await sql`INSERT INTO poll_options (poll_id, label, position) VALUES (${pollRows[0].id}, ${label}, ${pos++})`;
      }
    }
    planned.push({
      id: postId, author, createdAt: item.createdAt,
      category: item.category, festival: item.festival, type: item.type,
    });
  }
  report.posts = planned.length;
  return finishEngagement(batch, report, { seedUsers, genericUser, groupIds, eventIds, planned });
}


/** Phase 3: follows, engagement rows, votes, memberships, notifications. */
async function finishEngagement(
  batch: string,
  report: SeedReport,
  ctx: {
    seedUsers: SeedUser[];
    genericUser: SeedUser;
    groupIds: Array<{ id: string; affinity: 'GA' | 'DANGME' | 'ALL' }>;
    eventIds: Array<{ id: string; community: string; group: string; startsAt: Date }>;
    planned: PlannedPost[];
  },
): Promise<SeedReport> {
  const { seedUsers, genericUser, groupIds, eventIds, planned } = ctx;

  // ── 4. Social graph: 10-35 follows each (§67) ──
  console.log('[seed] step: follows');
  const follows = buildFollows(seedUsers);
  await batchedInsert(400, follows, (chunk) => sql`
    INSERT INTO follows ${sql(chunk.map((f) => ({
      follower_id: f.follower.id, followee_id: f.followee.id,
      is_demo: true, seed_batch: batch, created_at: f.createdAt,
    })))}`);
  report.follows = follows.length;

  // ── 5. Engagement: reactions / comments / replies / shares / views ──
  console.log('[seed] step: engagement');
  const eng = buildEngagement(planned, seedUsers);
  report.reactions = eng.reactions.length;
  report.comments = eng.comments.filter((c) => !c.parentId).length;
  report.shares = eng.shares.length;
  report.views = eng.views.length;

  await batchedInsert(400, eng.reactions, (chunk) => sql`
    INSERT INTO reactions ${sql(chunk.map((r) => ({
      post_id: r.postId, user_id: r.userId, type: r.type,
      is_demo: true, seed_batch: batch, created_at: r.createdAt,
    })))}`);
  console.log('[seed] step: reactions done', eng.reactions.length);

  const ordered = [...eng.comments].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const topLevel = ordered.filter((c) => !c.parentId);
  const pendingReplies = ordered.filter((c) => c.parentId === 'PENDING');
  const topIds = new Map<string, string>();
  for (const c of topLevel) {
    const rows = await sql`
      INSERT INTO comments (post_id, author_id, content, is_demo, seed_batch, created_at)
      VALUES (${c.postId}, ${c.userId}, ${c.content}, true, ${batch}, ${c.createdAt})
      RETURNING id`;
    topIds.set(`${c.postId}|${c.userId}|${c.createdAt.getTime()}`, rows[0].id as string);
  }
  const parentsByPost = new Map<string, string[]>();
  for (const c of topLevel) {
    const id = topIds.get(`${c.postId}|${c.userId}|${c.createdAt.getTime()}`)!;
    if (!parentsByPost.has(c.postId)) parentsByPost.set(c.postId, []);
    parentsByPost.get(c.postId)!.push(id);
  }
  let replyCount = 0;
  for (const reply of pendingReplies) {
    const parents = parentsByPost.get(reply.postId) ?? [];
    if (parents.length === 0) continue;
    const parentId = parents[randomInt(0, Math.min(parents.length, 5))];
    await sql`
      INSERT INTO comments (post_id, author_id, parent_comment_id, content, is_demo, seed_batch, created_at)
      VALUES (${reply.postId}, ${reply.userId}, ${parentId}, ${reply.content}, true, ${batch}, ${reply.createdAt})`;
    replyCount++;
  }
  report.replies = replyCount;
  console.log('[seed] step: comments done', eng.comments.length, 'replies', replyCount);


  await batchedInsert(400, eng.shares, (chunk) => sql`
    INSERT INTO shares ${sql(chunk.map((s) => ({
      post_id: s.postId, user_id: s.userId, target: 'PROFILE',
      target_key: 'PROFILE:' + s.userId, is_demo: true, seed_batch: batch,
      created_at: s.createdAt,
    })))}`);
  console.log('[seed] step: shares done', eng.shares.length);

  await batchedInsert(600, eng.views, (chunk) => sql`
    INSERT INTO post_views ${sql(chunk.map((v) => ({
      post_id: v.postId, user_id: v.userId,
      viewed_on: v.createdAt.toISOString().slice(0, 10),
      is_demo: true, seed_batch: batch, created_at: v.createdAt,
    })))}`);
  console.log('[seed] step: views done', eng.views.length);

  // ── 6. Poll votes (real rows §39) ──
  console.log('[seed] step: poll votes');
  const pollPosts = planned.filter((p) => p.type === 'POLL');
  for (const post of pollPosts) {
    const options = await sql`
      SELECT id FROM poll_options WHERE poll_id = (SELECT id FROM polls WHERE post_id = ${post.id})`;
    if (options.length === 0) continue;
    const voters = shuffled(seedUsers.filter((u) => u.id !== post.author.id)).slice(0, randomInt(20, 91));
    for (const voter of voters) {
      const option = pick(options);
      const ts = new Date(Math.min(
        post.createdAt.getTime() + randomInt(10, 7 * 24 * 60) * 60_000,
        Date.now() - 10 * 60_000,
      ));
      if (ts <= post.createdAt) continue;
      try {
        await sql`
          INSERT INTO poll_votes (poll_id, option_id, user_id, is_demo, seed_batch, created_at)
          VALUES ((SELECT id FROM polls WHERE post_id = ${post.id}), ${option.id}, ${voter.id}, true, ${batch}, ${ts})`;
        report.pollVotes++;
      } catch { /* unique voter/option — ignore */ }
    }
  }

  // ── 7. Group + event memberships ──
  console.log('[seed] step: memberships');
  const memberships = buildGroupMemberships(seedUsers, groupIds);
  await batchedInsert(400, memberships, (chunk) => sql`
    INSERT INTO group_members ${sql(chunk.map((m) => ({
      group_id: m.groupId, user_id: m.userId,
      is_demo: true, seed_batch: batch, joined_at: m.joinedAt,
    })))}`);
  report.groupMemberships = memberships.length;

  const rsvps = buildEventMemberships(seedUsers, eventIds);
  await batchedInsert(400, rsvps, (chunk) => sql`
    INSERT INTO event_members ${sql(chunk.map((m) => ({
      event_id: m.eventId, user_id: m.userId, rsvp: m.rsvp,
      is_demo: true, seed_batch: batch, created_at: m.createdAt,
    })))}`);
  report.eventMemberships = rsvps.length;


  // ── 8. Notifications for the interactions (§75) ──
  console.log('[seed] step: notifications');
  const authorByPost = new Map(planned.map((p) => [p.id, p.author.id] as const));
  const notifRows: any[] = [];
  const reactionsByPost = new Map<string, number>();
  for (const r of eng.reactions) {
    if ((reactionsByPost.get(r.postId) ?? 0) < 5) {
      reactionsByPost.set(r.postId, (reactionsByPost.get(r.postId) ?? 0) + 1);
      notifRows.push({ u: authorByPost.get(r.postId), a: r.userId, t: 'REACTION', e: 'post', id: r.postId, b: null, ts: r.createdAt.toISOString() });
    }
  }
  for (const c of topLevel) {
    notifRows.push({ u: authorByPost.get(c.postId), a: c.userId, t: 'COMMENT', e: 'post', id: c.postId, b: c.content.slice(0, 120), ts: c.createdAt.toISOString() });
  }
  for (const s of eng.shares) {
    notifRows.push({ u: authorByPost.get(s.postId), a: s.userId, t: 'SHARE', e: 'post', id: s.postId, b: null, ts: s.createdAt.toISOString() });
  }
  for (const f of follows.slice(0, 4000)) {
    notifRows.push({ u: f.followee.id, a: f.follower.id, t: 'FOLLOW', e: 'user', id: f.follower.id, b: null, ts: f.createdAt.toISOString() });
  }
  await batchedInsert(600, notifRows, (chunk) => sql`
    INSERT INTO notifications ${sql(chunk.map((n) => ({
      user_id: n.u, actor_id: n.a, type: n.t, entity_type: n.e,
      entity_id: n.id, body: n.b, is_demo: true, seed_batch: batch,
      created_at: n.ts,
    })))}`);
  report.notifications = notifRows.length;

  // ── 9. Demo conversations between fictional users (§36) ──
  console.log('[seed] step: conversations');
  let messageCount = 0;
  const candidates = seedUsers.filter((u) => u.id !== genericUser.id);
  for (let i = 0; i < 15; i++) {
    const [a, b] = shuffled(candidates).slice(0, 2);
    const conv = await sql`
      INSERT INTO conversations (created_by, is_demo, seed_batch) VALUES (${a.id}, true, ${batch}) RETURNING id`;
    await sql`
      INSERT INTO conversation_participants (conversation_id, user_id, is_demo, seed_batch)
      VALUES (${conv[0].id}, ${a.id}, true, ${batch}), (${conv[0].id}, ${b.id}, true, ${batch})`;
    let ts = new Date(Date.UTC(2026, 4, randomInt(1, 28), randomInt(8, 21), randomInt(0, 59)));
    for (let m = 0; m < randomInt(3, 7); m++) {
      ts = new Date(ts.getTime() + randomInt(2, 240) * 60_000);
      if (ts.getTime() > Date.now() - 60_000) break;
      const sender = m % 2 === 0 ? a.id : b.id;
      await sql`
        INSERT INTO messages (conversation_id, sender_id, content, is_demo, seed_batch, created_at)
        VALUES (${conv[0].id}, ${sender}, ${pick(DEMO_CHAT_LINES, i + m)}, true, ${batch}, ${ts})`;
      messageCount++;
    }
  }
  report.messages = messageCount;

  // ── 10. Seed metadata (§87) ──
  await sql`
    UPDATE demo_seed_metadata SET user_count = ${report.users}, post_count = ${report.posts},
      stats = ${JSON.stringify(report)}::jsonb, completed_at = now()
    WHERE batch = ${batch}`;
  return report;
}

const DEMO_CHAT_LINES = [
  'Hello! Are you joining the community clean-up on Saturday?',
  'Yes! Should I bring the gloves and bags again?',
  'Please do. Also the elders asked about the youth fund report.',
  'I will bring printed copies to the meeting.',
  'Great. Also, did you see the Homowo planning thread in the group?',
  'I did — the committee wants suggestions for the durbar venue.',
  'Let us propose the town park, it worked well last year.',
  'Agreed. I will post it in the group this evening.',
  'Perfect. Talk later, market is calling me!',
  'Haha go well! Bring some of that dried fish if you pass by the stall.',
] as const;

async function batchedInsert(chunkSize: number, rows: any[], build: (chunk: any[]) => Promise<any>) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    await build(chunk);
  }
}

