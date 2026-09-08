/** Polls + groups seed definitions. */
export { EVENT_SEEDS, BUSINESS_SEEDS, PAGE_SEEDS } from './platformPages.js';

export const POLLS: Array<{ question: string; options: string[] }> = [
  { question: 'Which food reminds you most of home?', options: ['Kenkey & fried fish', 'Banku & okro', 'Abolo with shrimp', 'Gari fotor'] },
  { question: 'Which traditional practice should young people learn first?', options: ['Our language', 'Drumming & dance', 'Bead making', 'Cooking our dishes'] },
  { question: 'Should our language be taught more widely in schools?', options: ['Yes, as a full subject', 'Yes, but as a club', 'Only in our traditional areas', 'Not sure'] },
  { question: 'Which cultural topic should GADAVIRAL document next?', options: ['Family names & stools', 'Festival histories', 'Traditional foods', 'Music & dance'] },
  { question: 'Best month for a diaspora homecoming?', options: ['August (festival season)', 'December (holidays)', 'Easter break', 'Any month!'] },
  { question: 'Where should our next community meetup be?', options: ['Accra', 'Tema', 'Somanya / Odumase', 'Ada'] },
  { question: 'Most underrated snack from home?', options: ['Kakro (ripe plantain fritters)', 'Yele kakro', 'Nkate cake', 'Kuli-kuli'] },
  { question: 'Should businesses in our area get a verified directory badge?', options: ['Yes, verified badge', 'No, keep it simple'] },
  { question: 'What helps youth stay rooted in culture most?', options: ['Festival participation', 'Language classes', 'Mentorship', 'Music & media'] },
  { question: 'Pick the next GADAVIRAL feature to improve', options: ['Messaging', 'Groups', 'Events', 'Marketplace'] },
  { question: 'Festival food battle — which plate wins?', options: ['Team Kpokpoi', 'Team New Yam', 'Both, no fights'] },
  { question: 'How often should we host online language sessions?', options: ['Weekly', 'Fortnightly', 'Monthly'] },
];

export const GROUP_SEEDS = [
  ['Ga Heritage', 'GA_HERITAGE', 'History, lineage, traditions and identity of the Ga people.'],
  ['Dangme Heritage', 'DANGME_HERITAGE', 'History, clans and heritage of the Dangme people.'],
  ['Ga Language Learners', 'GA_LANGUAGE', 'Practice Ga — greetings, proverbs, tones and everyday conversation.'],
  ['Dangme Language Lounge', 'DANGME_LANGUAGE', 'Krobo, Ada, Shai, Ningo, Prampram and Osudoku language practice.'],
  ['Homowo Community', 'HOMOWO', 'Everything Homowo — dates, preparations, durbar photos and family moments.'],
  ['Ngmayem Community', 'NGMAYEM', 'Krobo yam festival conversations — Ngmayem history and celebrations.'],
  ['Asafotufiam Community', 'ASAFOTUFIAM', 'Ada festival talk — Asafotufiam history, homecoming and pageantry.'],
  ['Dipo Cultural Discussions', 'DIPO', 'Respectful documentation and discussion of the Krobo Dipo rite.'],
  ['Ga Youth Network', 'GA_YOUTH', 'Young Ga professionals and students building the future.'],
  ['Dangme Youth Forum', 'DANGME_YOUTH', 'Krobo, Ada, Shai, Ningo, Prampram & Osudoku youth matters.'],
  ['Ga Dangme Diaspora', 'DIASPORA', 'Keeping culture alive across London, Toronto, New York and beyond.'],
  ['Ga Dangme Entrepreneurs', 'ENTREPRENEURS', 'Business owners, side hustles, mentorship and opportunities.'],
  ['Traditional Food Corner', 'FOOD', 'Recipes, markets, restaurants and food heritage.'],
  ['History & Heritage Club', 'HISTORY_CLUB', 'Deep dives into oral history, landmarks and scholarship.'],
  ['Music & Entertainment', 'MUSIC', 'Kpanlogo, klama, gospel, highlife and new wave artists.'],
] as const;
