/** Comment dispatcher — pools from part A + part B. */
const pick = <T,>(arr: readonly T[], i: number): T => arr[i % arr.length];

import { COMMENTS_HISTORY, COMMENTS_LANGUAGE, COMMENTS_FOOD, COMMENTS_DIASPORA } from './contentComments.js';

export const COMMENTS_BUSINESS = [
  'Prices please! Ready customer here.',
  'Supporting this immediately. This is what community looks like.',
  'Used this service last month — can confirm, excellent quality.',
  'Congrats on the growth! Consistency truly pays.',
  'DM sent for booking. Great work.',
  'The bead workshop turned my sister’s hobby into income. Legend behaviour.',
  'How far do you deliver? Asking from Tema.',
  'Bookmarking for December events. Well done!',
  'Real people, real service — nothing beats it.',
  'Sharing to my page. More people need to see this.',
] as const;

export const COMMENTS_FESTIVAL = [
  'Ayeekoo to everyone preparing! Safe travels to all returning home.',
  'Our festival is a university of culture. Every year I learn something new.',
  'The drumming started near our house last night — my whole body knew the season.',
  'Homowo is my favourite time of year. Family, food, forgiveness.',
  'Please share dates for the main durbar so we can plan.',
  'Asafotufiam in Big Ada is unmatched. See you all there!',
  'Respectful additions only in this thread please — our traditions deserve accuracy.',
  'Ngmayem loadings! The new yam pottage is already calling me.',
  'First time bringing my kids this year. They must see it themselves.',
  'Unity and thanksgiving — that is the heart of it all.',
] as const;

export const COMMENTS_GENERIC = [
  'Well said.',
  'This is the content I joined this platform for.',
  'Great point — added my thoughts below.',
  'Interesting perspective, thanks for sharing.',
  'Totally agree with this.',
  'Can you share more details?',
  'Sending this to my siblings right now.',
  'Wisdom. Plain and simple.',
  'This made my evening.',
  'Following for more like this.',
  'Very helpful, thank you.',
  'Word. Nothing more to add.',
] as const;

export const REPLIES = [
  'Exactly! You get it.',
  'Thank you — that means a lot.',
  'Haha, you are not the first to say this today.',
  'I will DM you the details now.',
  'True talk. Adding it to the plan.',
  'My thoughts exactly when I first learned it.',
  'Good question — let me find out and reply properly.',
  'Agreed on all points.',
  'Come, let us plan it together.',
  'Noted with thanks!',
] as const;

export const TEST_COMMENTS = [
  'Comment test passed. Feature works!',
  'Reply test — can you see this under your comment?',
  'Reacting and commenting at once. Multi-feature test.',
  'Notification test check 1-2.',
  'Sharing this test post to verify share counters.',
  'The feed ordering looks correct on my side.',
] as const;

export function commentFor(category: string, i: number): string {
  switch (category) {
    case 'history': return pick(COMMENTS_HISTORY, i);
    case 'language': return pick(COMMENTS_LANGUAGE, i);
    case 'food': case 'marketplace': return pick(COMMENTS_FOOD, i);
    case 'diaspora': return pick(COMMENTS_DIASPORA, i);
    case 'business': case 'jobs': return pick(COMMENTS_BUSINESS, i);
    case 'festival': return pick(COMMENTS_FESTIVAL, i);
    case 'test': return pick(TEST_COMMENTS, i);
    default: return pick(COMMENTS_GENERIC, i);
  }
}

