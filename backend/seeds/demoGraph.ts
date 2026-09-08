import { randomInt, pick, shuffled } from '../src/utils/crypto.js';
import type { SeedUser } from './demoEngage.js';

const HOUR = 3_600_000;

/** Social graph (§67): each demo user follows 10-35 others; no self-follows. */
export function buildFollows(users: SeedUser[]): Array<{ follower: SeedUser; followee: SeedUser; createdAt: Date }> {
  const follows: Array<{ follower: SeedUser; followee: SeedUser; createdAt: Date }> = [];
  const seen = new Set<string>();
  for (const u of users) {
    const target =
      u.identity.persona === 'ACTIVE' ? randomInt(20, 36)
      : u.identity.persona === 'MODERATE' ? randomInt(14, 26)
      : u.identity.persona === 'LOW' ? randomInt(10, 19)
      : randomInt(10, 15);
    const sameEthnic = users.filter((o) => o.id !== u.id && o.identity.ethnic === u.identity.ethnic);
    const others = users.filter((o) => o.id !== u.id && o.identity.ethnic !== u.identity.ethnic);
    const candidates = [
      ...shuffled(sameEthnic).slice(0, Math.ceil(target * 0.7)),
      ...shuffled(others).slice(0, target),
    ];
    let added = 0;
    for (const c of candidates) {
      if (added >= target) break;
      const key = `${u.id}:${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const start = Math.max(u.identity.createdAt.getTime(), c.identity.createdAt.getTime());
      const end = Date.UTC(2026, 3, 30);
      follows.push({ follower: u, followee: c, createdAt: new Date(start + randomInt(0, Math.max(1, end - start))) });
      added++;
    }
  }
  return follows;
}

/** Group memberships: 2-6 per user, affinity-weighted. */
export function buildGroupMemberships(
  users: SeedUser[],
  groups: Array<{ id: string; affinity: 'GA' | 'DANGME' | 'ALL' }>,
): Array<{ userId: string; groupId: string; joinedAt: Date }> {
  const out: Array<{ userId: string; groupId: string; joinedAt: Date }> = [];
  const seen = new Set<string>();
  for (const u of users) {
    const n = randomInt(2, 7);
    const affinityPool = groups.filter((g) => g.affinity === 'ALL' || g.affinity === u.identity.ethnic || u.identity.ethnic === 'UNSPECIFIED');
    const otherPool = groups.filter((g) => !affinityPool.includes(g));
    const chosen = [...shuffled(affinityPool).slice(0, n), ...shuffled(otherPool).slice(0, 2)];
    for (const g of chosen.slice(0, n)) {
      const key = `${u.id}:${g.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const start = u.identity.createdAt.getTime();
      const end = Date.UTC(2026, 7, 20);
      out.push({ userId: u.id, groupId: g.id, joinedAt: new Date(start + randomInt(0, Math.max(1, end - start))) });
    }
  }
  return out;
}

/** Event RSVPs: 15-60 per event from culturally relevant users. */
export function buildEventMemberships(
  users: SeedUser[],
  events: Array<{ id: string; community: string; group: string; startsAt: Date }>,
): Array<{ userId: string; eventId: string; rsvp: 'GOING' | 'INTERESTED'; createdAt: Date }> {
  const out: Array<{ userId: string; eventId: string; rsvp: 'GOING' | 'INTERESTED'; createdAt: Date }> = [];
  const seen = new Set<string>();
  for (const ev of events) {
    const gaPool = users.filter((u) => u.identity.ethnic === 'GA' || ev.group === 'ALL');
    const dngPool = users.filter((u) => u.identity.ethnic !== 'GA');
    const pool = ev.group === 'GA' ? gaPool : dngPool;
    const n = randomInt(15, 61);
    for (const u of shuffled(pool).slice(0, n)) {
      const key = `${u.id}:${ev.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const start = Math.max(Date.UTC(2026, 3, 1), u.identity.createdAt.getTime());
      const end = ev.startsAt.getTime() - HOUR;
      const createdAt = new Date(start + randomInt(0, Math.max(1, end - start)));
      out.push({ userId: u.id, eventId: ev.id, rsvp: pick(['GOING', 'GOING', 'INTERESTED']), createdAt });
    }
  }
  return out;
}
