import { randomInt, pick, shuffled } from '../src/utils/crypto.js';
import { CATEGORY_KINDS, type PostKind } from './data/posts.js';
import { FESTIVALS } from './data/contentFestivals.js';
import { POLLS } from './data/platform.js';
import { genTest } from './data/contentCommunity.js';
import type { DemoIdentity } from './userFactory.js';

export interface PostPlan {
  caption: string;
  type: 'TEXT' | 'PHOTO' | 'VIDEO' | 'POLL' | 'ANNOUNCEMENT';
  category: string;
  festival?: string;
  festivalGroup?: 'GA' | 'DANGME';
  media: 'IMAGE' | 'VIDEO' | null;
  poll?: { question: string; options: string[] };
  authorFilter: 'GA' | 'DANGME' | 'DIASPORA' | 'GENERIC' | 'ANY';
  createdAt: Date;
}

// Africa/Accra is UTC+0 year-round → UTC math is Ghana local time (spec §56).
const MORNING = [6, 9], AFTERNOON = [12, 15], EVENING = [18, 22.5 * 60 / 60]; // evening ends 22:30

function ghanaDateTime(monthIdx: number, day: number, hour: number, minute: number, second = 0): Date {
  return new Date(Date.UTC(2026, monthIdx, day, hour, minute, second));
}

function randomActiveHour(): { h: number; m: number; s: number } {
  const roll = randomInt(0, 100);
  let range: [number, number];
  if (roll < 30) range = [6, 9];
  else if (roll < 55) range = [12, 15];
  else range = [18, 22.5];
  const startMin = Math.round(range[0] * 60);
  const endMin = Math.round(range[1] * 60);
  const total = startMin + randomInt(0, endMin - startMin);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const s = randomInt(0, 60);
  return { h, m, s };
}

function randomDayBetween(months: [number, number]): { mi: number; day: number } {
  const mi = randomInt(months[0], months[1] + 1);
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mi];
  // Posts may run May → 6 September 2026 (spec §55: nothing after 7 Sep,
  // and interactions must still fit between the post and "now").
  const cap = mi === 8 ? 7 : daysInMonth;
  const day = randomInt(1, cap + 1);
  return { mi, day };
}

/** Build exactly 150 unique posts: 99 category + 32 festival + 11 polls + 8 test. */
export function buildPostPlan(identities: DemoIdentity[]): PostPlan[] {
  const used = new Set<string>();
  const plan: PostPlan[] = [];

  const push = (p: PostPlan) => {
    if (used.has(p.caption)) throw new Error(`Duplicate seed caption: ${p.caption}`);
    used.add(p.caption);
    plan.push(p);
  };

  // 1. Test posts — generic account, spread May → early Sep (§65)
  for (let i = 0; i < 8; i++) {
    const day = 10 + i * 16; // 10, 26, 42, …, 122 → May 10 … Sep 1
    const mi = day <= 31 ? 4 : day <= 59 ? 5 : day <= 90 ? 6 : day <= 121 ? 7 : 8;
    const d = day <= 31 ? day : day <= 59 ? day - 31 : day <= 90 ? day - 59 : day <= 121 ? day - 90 : day - 121;
    const { h, m, s } = randomActiveHour();
    push({
      caption: genTest(i),
      type: i === 5 ? 'POLL' : i === 1 ? 'PHOTO' : 'TEXT',
      category: 'test',
      media: i === 1 ? 'IMAGE' : null,
      poll: i === 5 ? { question: 'Testing polls — which feature should we improve next?', options: ['Feed', 'Messaging', 'Groups', 'Notifications'] } : undefined,
      authorFilter: 'GENERIC',
      createdAt: ghanaDateTime(mi, d, h, m, s),
    });
  }

  // 2. Category posts — per-generator index keeps every caption unique
  const fnCounter = new Map<PostKind['gen'], number>();
  for (const kind of CATEGORY_KINDS) {
    for (let n = 0; n < kind.count; n++) {
      const i = fnCounter.get(kind.gen) ?? 0;
      fnCounter.set(kind.gen, i + 1);
      const { mi, day } = randomDayBetween([4, 8]);
      const { h, m, s } = randomActiveHour();
      const diaspora = kind.category === 'diaspora';
      push({
        caption: kind.gen(i),
        type: kind.type,
        category: kind.category,
        media: kind.media ? (kind.type === 'VIDEO' ? 'VIDEO' : 'IMAGE') : null,
        authorFilter: diaspora ? 'DIASPORA' : (randomInt(0, 4) === 0 ? 'DIASPORA' : 'ANY'),
        createdAt: ghanaDateTime(mi, day, h, m, s),
      });
    }
  }

  // 3. Festival posts — strict ownership + seasonal clustering (§60)
  for (const f of FESTIVALS) {
    for (let i = 0; i < f.count; i++) {
      const { mi, day } = randomDayBetween(f.window as [number, number]);
      const { h, m, s } = randomActiveHour();
      push({
        caption: pick(f.pool, i),
        type: f.media ? 'PHOTO' : 'TEXT',
        category: 'festival',
        festival: f.festival,
        festivalGroup: f.group,
        media: f.media ? 'IMAGE' : null,
        authorFilter: f.group,
        createdAt: ghanaDateTime(mi, day, h, m, s),
      });
    }
  }

  // 4. Polls (database-backed; real votes §39)
  for (let i = 0; i < POLLS.length; i++) {
    const { mi, day } = randomDayBetween([4, 8]);
    const { h, m, s } = randomActiveHour();
    push({
      caption: POLLS[i].question,
      type: 'POLL',
      category: 'poll',
      media: null,
      poll: POLLS[i],
      authorFilter: 'ANY',
      createdAt: ghanaDateTime(mi, day, h, m, s),
    });
  }

  plan.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return plan;
}

export const EXPECTED_TOTAL_POSTS = 8 + CATEGORY_KINDS.reduce((n, k) => n + k.count, 0)
  + FESTIVALS.reduce((n, f) => n + f.count, 0) + POLLS.length;

export function pickAuthorFor(
  planItem: PostPlan,
  gaUsers: DemoIdentity[],
  dangmeUsers: DemoIdentity[],
  diasporaUsers: DemoIdentity[],
  generic: DemoIdentity,
  usedPerUser: Map<string, number>,
): DemoIdentity {
  let pool: DemoIdentity[];
  if (planItem.authorFilter === 'GENERIC') return generic;
  if (planItem.authorFilter === 'DIASPORA') pool = diasporaUsers.length ? diasporaUsers : [...gaUsers, ...dangmeUsers];
  else if (planItem.authorFilter === 'GA') pool = gaUsers;
  else if (planItem.authorFilter === 'DANGME') pool = dangmeUsers;
  else pool = [...gaUsers, ...dangmeUsers, ...diasporaUsers];
  // Spread authorship; allow authors 2-7 posts each
  const maxPosts = 7;
  const candidates = shuffled(pool).filter((u) => (usedPerUser.get(u.username) ?? 0) < maxPosts);
  const chosen = candidates[0] ?? pool[0];
  usedPerUser.set(chosen.username, (usedPerUser.get(chosen.username) ?? 0) + 1);
  return chosen;
}
