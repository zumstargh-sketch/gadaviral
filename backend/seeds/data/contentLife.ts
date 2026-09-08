/** Diaspora, business, music and youth caption pools. */
const pick = <T,>(arr: readonly T[], i: number): T => arr[i % arr.length];

export const DIASPORA = [
  'Third winter here and I still cook our food every Sunday. It keeps the family grounded.',
  'My kids video-called their grandparents today and spoke our language for ten whole minutes. Progress!',
  'Found a Ghanaian shop two towns over that sells proper kenkey flour. Small joys abroad.',
  'Culture abroad: we hosted a small gathering, played our music, cooked our food. The children danced all evening.',
  'Homesickness is real, but a pot of stew and a phone call home fixes most of it.',
  'Explaining our festivals to colleagues at work has become my side job. I bring pictures. They bring questions.',
  'Flight booked for December. My mother does not know yet. Surprise of the year incoming.',
  'The diaspora chapter of our community association is growing. Twenty families now. We meet monthly.',
  'Teaching my British-born niece to greet properly. She now says it with the correct respect tone. Auntie duties done.',
  'Someone asked me why we celebrate our festivals abroad. Because identity does not need a postcode.',
  'Shipping a barrel home this month. The list my siblings sent though, I cannot laugh alone.',
  'Our little cultural group performed at a community fair today. People were fascinated by the drumming.',
] as const;

export const BUSINESS = [
  'Small business spotlight: we now deliver fresh kenkey within Accra on weekends. DM for details.',
  'Rebranding my fashion line with more of our traditional patterns. The sample pieces look incredible.',
  'One year of running my catering service. Thank you to every family that trusted us with their occasions.',
  'My bead-making workshop trained twelve young people this quarter. Skills pay bills.',
  'Expanding the shop — new shelves, new stock, same honest prices.',
  'To every young person selling something online: consistency beats hype. Keep showing up.',
  'Our tour service took a lovely family around our heritage sites this weekend. Bookings open for next month.',
  'Tailoring update: wedding orders for the season are officially full. Book early next time!',
  'Support businesses in our community — quality service, fair prices, real people.',
  'From one cooler of drinks at events to a full mobile bar service. Growth is patient work.',
  'Photography bookings for festival season are open. Our culture deserves to be documented beautifully.',
  'My mother’s forty years of trading wisdom fits in one sentence: serve people well and they will find you.',
] as const;

export const MUSIC = [
  'Kpanlogo drums at a family outing last weekend — the young people learned faster than expected.',
  'That moment when the whole compound joins the chorus. Music is our shared language.',
  'Looking for a traditional drumming group for a naming ceremony next month. Recommendations?',
  'Our traditional music deserves modern stages. Who is producing quality recordings these days?',
  'Learned a new dance step at the rehearsal. My knees have filed a formal complaint.',
  'Church service today had full traditional drumming. The building was shaking. Beautiful.',
  'Playlists for festival season ready — a blend of old classics and new artists keeping the sound alive.',
] as const;

export const YOUTH = [
  'Mentoring session with final-year students today. Their energy gives me hope for our communities.',
  'Scholarship applications close soon — share with every brilliant student you know.',
  'Our youth club cleaned the community park this morning. Fifty bags of rubbish. Proud of them.',
  'Homework club update: attendance doubled since we started serving snacks. Simple solutions work.',
  'Advice for young people: learn a skill alongside your studies. Degree plus skill equals options.',
  'The kids at the community centre asked for books in our language. We are sourcing them. Any leads?',
  'Debate club topic this month: should our festivals be restructured to attract younger crowds?',
] as const;

export const genDiaspora = (i: number) => pick(DIASPORA, i);
export const genBusiness = (i: number) => pick(BUSINESS, i);
export const genMusic = (i: number) => pick(MUSIC, i);
export const genYouth = (i: number) => pick(YOUTH, i);
