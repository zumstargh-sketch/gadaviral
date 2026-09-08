import { randomInt, pick, shuffled } from '../src/utils/crypto.js';
import { commentFor, REPLIES } from './data/contentCommentsB.js';
import type { DemoIdentity } from './userFactory.js';

export interface SeedUser { id: string; identity: DemoIdentity; }

export interface PlannedPost {
  id: string; author: SeedUser; createdAt: Date;
  category: string; festival?: string; type: string;
}

const MIN = 60_000, HOUR = 3_600_000;
export const NOW = () => Date.now();

function addMinutes(base: Date, min: number): Date {
  return new Date(base.getTime() + min * MIN);
}
function clampFuture(ts: Date, minPost: Date): Date | null {
  const t = Math.min(ts.getTime(), NOW() - 5 * MIN);
  return t <= minPost.getTime() ? null : new Date(t);
}

/** Tier per post (§70): low ~15%, normal ~70%, high ~15% (boosted by rich content). */
function tierFor(post: PlannedPost): 'LOW' | 'NORMAL' | 'HIGH' {
  const r = randomInt(0, 100);
  let tier: 'LOW' | 'NORMAL' | 'HIGH' = r < 15 ? 'LOW' : r < 85 ? 'NORMAL' : 'HIGH';
  const boostable = post.type === 'PHOTO' || post.type === 'VIDEO' || post.type === 'POLL'
    || post.festival || ['history', 'language', 'food', 'diaspora'].includes(post.category);
  if (boostable && tier === 'NORMAL' && randomInt(0, 10) < 5) tier = 'HIGH';
  if (boostable && tier === 'LOW' && randomInt(0, 10) < 4) tier = 'NORMAL';
  return tier;
}

const RANGES = {
  reactions: { LOW: [5, 12], NORMAL: [12, 40], HIGH: [35, 55] } as const,
  comments: { LOW: [1, 3], NORMAL: [3, 10], HIGH: [10, 18] } as const,
  shares: { LOW: [0, 1], NORMAL: [0, 5], HIGH: [5, 15] } as const,
  views: { LOW: [15, 60], NORMAL: [60, 180], HIGH: [150, 250] } as const,
};

class DailyCaps {
  private counts = new Map<string, number>();
  tryConsume(userId: string, day: string, kind: 'r' | 'c' | 's', limit: number): boolean {
    const key = `${kind}:${userId}:${day}`;
    const cur = this.counts.get(key) ?? 0;
    if (cur >= limit) return false;
    this.counts.set(key, cur + 1);
    return true;
  }
}

export interface EngagementResult {
  reactions: Array<{ postId: string; userId: string; type: string; createdAt: Date }>;
  comments: Array<{ postId: string; userId: string; parentId: string | null; content: string; createdAt: Date }>;
  shares: Array<{ postId: string; userId: string; createdAt: Date }>;
  views: Array<{ postId: string; userId: string; createdAt: Date }>;
}

const REACTION_TYPES = ['LIKE', 'LOVE', 'CELEBRATE', 'HAHA', 'WOW', 'SAD', 'PROUD'];

/** Interaction plan (§68-72): caps 70/25/12/20/400 per post; 15/5/4 daily per user. */
export function buildEngagement(posts: PlannedPost[], users: SeedUser[]): EngagementResult {
  const caps = new DailyCaps();
  const result: EngagementResult = { reactions: [], comments: [], shares: [], views: [] };
  const reacted = new Set<string>();
  const topCommented = new Set<string>();
  const shared = new Set<string>();
  const personaW: Record<DemoIdentity['persona'], number> = { ACTIVE: 10, MODERATE: 6, LOW: 3, LURKER: 1 };
  const weighted: SeedUser[] = [];
  for (const u of users) for (let i = 0; i < personaW[u.identity.persona]; i++) weighted.push(u);

  const dayOf = (d: Date) => d.toISOString().slice(0, 10);
  const tryReact = (u: SeedUser, post: PlannedPost, ts: Date) => {
    if (u.id === post.author.id || reacted.has(`${u.id}:${post.id}`)) return false;
    if (!caps.tryConsume(u.id, dayOf(ts), 'r', 15)) return false;
    reacted.add(`${u.id}:${post.id}`);
    result.reactions.push({ postId: post.id, userId: u.id, type: pick(REACTION_TYPES), createdAt: ts });
    return true;
  };
  const tryComment = (u: SeedUser, post: PlannedPost, ts: Date, parentId: string | null, content: string) => {
    if (parentId === null) {
      if (u.id === post.author.id || topCommented.has(`${u.id}:${post.id}`)) return false;
      topCommented.add(`${u.id}:${post.id}`);
    }
    if (!caps.tryConsume(u.id, dayOf(ts), 'c', 5)) return false;
    result.comments.push({ postId: post.id, userId: u.id, parentId, content, createdAt: ts });
    return true;
  };
  const tryShare = (u: SeedUser, post: PlannedPost, ts: Date) => {
    if (u.id === post.author.id || shared.has(`${u.id}:${post.id}`)) return false;
    if (!caps.tryConsume(u.id, dayOf(ts), 's', 4)) return false;
    shared.add(`${u.id}:${post.id}`);
    result.shares.push({ postId: post.id, userId: u.id, createdAt: ts });
    return true;
  };

  for (const post of posts) {
    const tier = tierFor(post);
    const interactors = () => shuffled(weighted).slice(0, 220);

    // Reactions — 1-60 min after posting (§71)
    const [rMin, rMax] = RANGES.reactions[tier];
    let reactionsLeft = randomInt(rMin, rMax + 1);
    for (const u of interactors()) {
      if (reactionsLeft <= 0) break;
      const ts = clampFuture(addMinutes(post.createdAt, randomInt(1, 61)), post.createdAt);
      if (!ts) break;
      if (tryReact(u, post, ts)) reactionsLeft--;
    }

    // Comments — 5 min to 12 h after posting
    const [cMin, cMax] = RANGES.comments[tier];
    let commentsLeft = randomInt(cMin, cMax + 1);
    const postComments: Array<{ userId: string; ts: Date }> = [];
    let ci = post.id.length;
    for (const u of interactors()) {
      if (commentsLeft <= 0) break;
      const ts = clampFuture(addMinutes(post.createdAt, randomInt(5, 12 * 60 + 1)), post.createdAt);
      if (!ts) break;
      if (tryComment(u, post, ts, null, commentFor(post.category, ci++))) {
        commentsLeft--;
        postComments.push({ userId: u.id, ts });
      }
    }

    // Replies — 5 min to 48 h after parent; total comments per post ≤ 25 (§68)
    const topCount = postComments.length;
    let repliesLeft = randomInt(0, Math.min(9, 25 - topCount + 1));
    let ri = post.id.length;
    for (const parent of postComments) {
      if (repliesLeft <= 0) break;
      const nReplies = randomInt(0, 3);
      for (let k = 0; k < nReplies && repliesLeft > 0; k++) {
        const u = pick(weighted);
        const ts = clampFuture(addMinutes(parent.ts, randomInt(5, 48 * 60 + 1)), parent.ts);
        if (!ts) continue;
        if (tryComment(u, post, ts, 'PENDING', pick(REPLIES, ri++))) repliesLeft--;
      }
    }

    // Shares — 10 min to 72 h after posting
    const [sMin, sMax] = RANGES.shares[tier];
    let sharesLeft = randomInt(sMin, sMax + 1);
    for (const u of interactors()) {
      if (sharesLeft <= 0) break;
      const ts = clampFuture(addMinutes(post.createdAt, randomInt(10, 72 * 60 + 1)), post.createdAt);
      if (!ts) break;
      if (tryShare(u, post, ts)) sharesLeft--;
    }

    // Views — spread 1-14 days
    const [vMin, vMax] = RANGES.views[tier];
    for (const u of shuffled(users).slice(0, randomInt(vMin, vMax + 1))) {
      const ts = clampFuture(
        new Date(post.createdAt.getTime() + randomInt(1, 14 * 24) * HOUR + randomInt(0, 59) * MIN),
        post.createdAt,
      );
      if (!ts) continue;
      result.views.push({ postId: post.id, userId: u.id, createdAt: ts });
    }
  }
  return result;
}

