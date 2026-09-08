/**
 * Festival posts with STRICT cultural ownership (spec §60):
 *   GA:    Homowo, Kplejoo
 *   DANGME: Ngmayem (Krobo), Asafotufiam (Ada), Dipo (Krobo)
 * Post dates cluster around each festival's season in 2026.
 */
const pick = <T,>(arr: readonly T[], i: number): T => arr[i % arr.length];

export interface FestivalKind {
  festival: string;
  group: 'GA' | 'DANGME';
  window: [number, number]; // inclusive month range (1-12) in 2026
  count: number;
  pool: readonly string[];
  media?: boolean;
}

export const FESTIVALS: FestivalKind[] = [
  {
    festival: 'Kplejoo', group: 'GA', window: [5, 5], count: 3,
    pool: [
      'Kplejoo season is here — a Ga festival of unity and thanksgiving marked with special rites and communal celebration.',
      'Explaining Kplejoo to my office colleagues this week. Our calendar is rich with meaning.',
      'Kplejoo gatherings this weekend brought the towns together. Peace, unity, tradition.',
    ],
  },
  {
    festival: 'Homowo', group: 'GA', window: [6, 8], count: 9,
    pool: [
      'Homowo season is approaching and the whole house is already planning. The hooting at hunger is our story of survival.',
      'Preparing for Homowo means prepping kpokpoi ingredients and reconciling with family. The peace matters more than the food.',
      'Our elders say Homowo is not complete without visiting family. Book your travels early!',
      'The drumming has started in the neighbourhood. Homowo is truly a feeling before it is a festival.',
      'Homowo reminder: the festival commemorates overcoming famine. Teach the children the meaning, not just the party.',
      'Sprinkling of kpokpoi is coming. May every family celebrating find peace and plenty.',
      'Homowo homecoming confirmed. Accra, see you soon — bring your appetite and your dancing feet.',
      'The twins and I practised the Homowo songs grandmother taught us. She corrected every single line. Worth it.',
      'From sowing ban to the sprinkling: every Homowo ritual carries a memory of survival. Respect to our ancestors.',
    ],
  },
  {
    festival: 'Homowo', group: 'GA', window: [7, 8], count: 3, media: true,
    pool: [
      'Homowo kpokpoi preparation in progress. The aroma alone is a celebration.',
      'Family gathering for Homowo — four generations under one roof. This is what the festival is about.',
      'Street procession photos from the Homowo celebration. The colours, the drums, the joy.',
    ],
  },
  {
    festival: 'Ngmayem', group: 'DANGME', window: [7, 8], count: 5,
    pool: [
      'Ngmayem season — the yam festival of the Krobo people giving thanks for the new harvest. Preparation mode activated.',
      'The new yam is in and Ngmayem thanksgiving is near. Our Krobo traditions run deep.',
      'Ngmayem means honouring the harvest that sustained our ancestors. Proud Krobo daughter here.',
      'Community preparations for Ngmayem are in full swing in Odumase. The drums never lie — festival is close.',
      'Manya Krobo, Ngmayem is ours — a festival of thanksgiving for the mighty yam. See you at the durbar.',
    ],
  },
  {
    festival: 'Ngmayem', group: 'DANGME', window: [7, 8], count: 2, media: true,
    pool: [
      'Fresh yams displayed for Ngmayem thanksgiving. Simple food, deep gratitude.',
      'Krobo beads and new yam — two treasures meeting at Ngmayem season.',
    ],
  },
  {
    festival: 'Asafotufiam', group: 'DANGME', window: [7, 8], count: 5,
    pool: [
      'Asafotufiam in Ada is approaching — marked by the firing of muskets, commemorating historical exploits and welcoming all sons and daughters home.',
      'Ada people, Asafotufiam week is here! Travel safely, greet the elders, honour the history.',
      'The river, the pageantry, the homecoming — Asafotufiam binds Ada together year after year.',
      'First time attending Asafotufiam with my in-laws. The ceremony and hospitality were unforgettable.',
      'Asafotufiam teaches the young that Ada history is living memory, not a school chapter.',
    ],
  },
  {
    festival: 'Asafotufiam', group: 'DANGME', window: [8, 8], count: 2, media: true,
    pool: [
      'Procession scenes from Asafotufiam in Big Ada. History you can hear.',
      'River pageantry during Asafotufiam week. Ada showed up and showed out.',
    ],
  },
  {
    festival: 'Dipo', group: 'DANGME', window: [5, 5], count: 3,
    pool: [
      'Respectful thread: Dipo is a Krobo rite of passage with deep family meaning. Let us document it accurately, with dignity.',
      'Dipo season conversations at home tonight — what we keep, what we adapt, and why context matters.',
      'Aunties preparing for the family Dipo rites. The cloth, the beads, the songs — heritage in motion.',
    ],
  },
];

export const festivalCount = FESTIVALS.reduce((n, f) => n + f.count, 0);
