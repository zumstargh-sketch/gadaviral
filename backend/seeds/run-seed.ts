import { seedDemo } from './demoManager.js';
import { sql } from '../src/db/client.js';

const force = process.argv.includes('--force');
try {
  console.log('[seed:demo] starting…');
  const report = await seedDemo({ force });
  console.log('[seed:demo] completed — batch', report.batch);
  console.table({
    users: report.users, posts: report.posts, follows: report.follows,
    reactions: report.reactions, comments: report.comments, replies: report.replies,
    shares: report.shares, views: report.views, pollVotes: report.pollVotes,
    groupMemberships: report.groupMemberships, eventMemberships: report.eventMemberships,
    notifications: report.notifications, messages: report.messages,
    groups: report.groups, events: report.events, businesses: report.businesses, pages: report.pages,
  });
} catch (e: any) {
  console.error('[seed:demo] FAILED:', e?.message ?? e);
  if (e?.query) console.error('[seed:demo] query:', String(e.query).slice(0, 500));
  if (e?.stack) console.error(e.stack.split('\n').slice(0, 4).join('\n'));
  process.exitCode = 1;
} finally {
  await sql.end();
}
