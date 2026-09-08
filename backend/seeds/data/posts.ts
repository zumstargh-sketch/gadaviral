/** Assembled post plan: category posts (unique captions). */
export interface PostKind {
  category: string;
  type: 'TEXT' | 'PHOTO' | 'VIDEO' | 'POLL' | 'ANNOUNCEMENT';
  count: number;
  gen: (i: number) => string;
  media?: boolean;
}

import { genHistory, genLanguage, genFood } from './contentCulture.js';
import { genDiaspora, genBusiness, genMusic, genYouth } from './contentLife.js';
import { genChurch, genJobs, genTravel, genAnnounce } from './contentCommunity.js';

export const CATEGORY_KINDS: PostKind[] = [
  { category: 'history', type: 'TEXT', count: 8, gen: genHistory },
  { category: 'history', type: 'PHOTO', count: 6, gen: genHistory, media: true },
  { category: 'language', type: 'TEXT', count: 8, gen: genLanguage },
  { category: 'language', type: 'PHOTO', count: 4, gen: genLanguage, media: true },
  { category: 'food', type: 'PHOTO', count: 8, gen: genFood, media: true },
  { category: 'food', type: 'TEXT', count: 4, gen: genFood },
  { category: 'diaspora', type: 'TEXT', count: 8, gen: genDiaspora },
  { category: 'diaspora', type: 'PHOTO', count: 4, gen: genDiaspora, media: true },
  { category: 'business', type: 'PHOTO', count: 7, gen: genBusiness, media: true },
  { category: 'business', type: 'TEXT', count: 5, gen: genBusiness },
  { category: 'music', type: 'VIDEO', count: 4, gen: genMusic, media: true },
  { category: 'music', type: 'TEXT', count: 3, gen: genMusic },
  { category: 'youth', type: 'TEXT', count: 4, gen: genYouth },
  { category: 'youth', type: 'PHOTO', count: 3, gen: genYouth, media: true },
  { category: 'church', type: 'TEXT', count: 3, gen: genChurch },
  { category: 'church', type: 'PHOTO', count: 2, gen: genChurch, media: true },
  { category: 'jobs', type: 'TEXT', count: 4, gen: genJobs },
  { category: 'marketplace', type: 'PHOTO', count: 3, gen: genJobs, media: true },
  { category: 'travel', type: 'PHOTO', count: 4, gen: genTravel, media: true },
  { category: 'travel', type: 'TEXT', count: 2, gen: genTravel },
  { category: 'announcement', type: 'ANNOUNCEMENT', count: 4, gen: genAnnounce },
];

export const categoryPostTotal = CATEGORY_KINDS.reduce((n, k) => n + k.count, 0);
