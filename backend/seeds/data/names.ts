/**
 * Curated Ga & Dangme naming pools (spec §46-50, §103).
 * These are fictional identities built from culturally appropriate structures.
 * Ga: honorifics Nii (male) / Naa (female) + given names + Ga surnames.
 * Dangme (Krobo, Ada, Shai, Ningo, Prampram, Osudoku): distinct surname pool,
 * Dangme given names plus English given names (common in these communities),
 * royal honorifics Nene (male) / Manye (female) used sparingly.
 * No real public figures are impersonated.
 */

export const GA_MALE_GIVEN = [
  'Ayi', 'Akrong', 'Amasa', 'Kortey', 'Kotey', 'Okai', 'Sowah', 'Sai',
  'Bortey', 'Boye', 'Lante', 'Oblitey', 'Nmai', 'Teko', 'Ablade',
] as const;

export const GA_FEMALE_GIVEN = [
  'Oboshie', 'Okailey', 'Ayorkor', 'Amorkor', 'Dedei', 'Adjeley', 'Adoley',
  'Ayeley', 'Lamiley', 'Koshie', 'Korkoi', 'Oyoo', 'Adukwei', 'Mamle',
  'Dede', 'Amui',
] as const;

export const GA_SURNAMES = [
  'Tetteh', 'Tettey', 'Laryea', 'Lamptey', 'Odoi', 'Nartey', 'Aryee',
  'Tackie', 'Quaye', 'Ankrah', 'Dodoo', 'Odartey', 'Ashalley', 'Ashong',
  'Kwei', 'Kpakpo', 'Ayeh', 'Addo', 'Martey', 'Mankralo', 'Amartey',
  'Ashitey', 'Acquaye', 'Odamtten', 'Ayittey', 'Okai', 'Quartey', 'Boi',
  'Okine', 'Adjiri',
] as const;

/** Distinct Dangme surname pool — not a copy of the Ga list. */
export const DANGME_SURNAMES = [
  'Osabutey', 'Odonkor', 'Omaboe', 'Okudzeto', 'Odjidja', 'Addy', 'Ayornu',
  'Okpattah', 'Adamtey', 'Teye', 'Ologo', 'Koney', 'Matey', 'Abladzei',
  'Djan', 'Okpenge', 'Nyadier', 'Sowordzi',
] as const;

/** English given names very common in Dangme communities (Krobo, Ada, …). */
export const DANGME_MALE_GIVEN = [
  'Odonkor', 'Teye', 'Emmanuel', 'Samuel', 'Daniel', 'Joseph', 'Peter',
  'Ebenezer', 'Nathaniel', 'Michael', 'Isaac', 'Jonathan', 'Cephas',
] as const;

export const DANGME_FEMALE_GIVEN = [
  'Mamley', 'Comfort', 'Grace', 'Elizabeth', 'Joyce', 'Patience', 'Esther',
  'Florence', 'Janet', 'Sarah', 'Naomi', 'Priscilla', 'Gifty',
] as const;

export type EthnicGroup =
  | 'GA' | 'DANGME' | 'KROBO' | 'ADA' | 'SHAI' | 'NINGO' | 'PRAMPRAM' | 'OSUDOKU';

export interface CommunitySpec {
  ethnic: EthnicGroup;
  label: string;          // human label, e.g. "Manya Krobo"
  locations: string[];    // realistic towns/areas
  weight: number;         // share of the 116 users
}

/** Community distribution across Ga towns and Dangme districts + diaspora. */
export const COMMUNITIES: CommunitySpec[] = [
  { ethnic: 'GA', label: 'Ga (Accra)', weight: 10, locations: ['Accra', 'Jamestown', 'Adabraka', 'Kaneshie', 'Tesano', 'Achimota'] },
  { ethnic: 'GA', label: 'Ga (Osu/La)', weight: 8, locations: ['Osu', 'La', 'Labadi'] },
  { ethnic: 'GA', label: 'Ga (Coastal)', weight: 9, locations: ['Teshie', 'Nungua', 'Chorkor', 'Korle Gonno', 'Mamprobi'] },
  { ethnic: 'GA', label: 'Ga (Tema)', weight: 6, locations: ['Tema', 'Tema Community 1', 'Tema Newtown'] },
  { ethnic: 'GA', label: 'Ga West/East/South', weight: 7, locations: ['Ga East', 'Ga West', 'Ga South', 'Dansoman', 'Amasaman'] },
  { ethnic: 'KROBO', label: 'Manya Krobo', weight: 8, locations: ['Odumase-Krobo', 'Krobo Odumase', 'Asesewa'] },
  { ethnic: 'KROBO', label: 'Yilo Krobo', weight: 6, locations: ['Somanya', 'Yilo Krobo', 'Akuse'] },
  { ethnic: 'ADA', label: 'Ada', weight: 7, locations: ['Ada', 'Big Ada', 'Ada Foah', 'Sege'] },
  { ethnic: 'SHAI', label: 'Shai', weight: 5, locations: ['Dodowa', 'Shai Hills', 'Oyibi'] },
  { ethnic: 'NINGO', label: 'Ningo', weight: 4, locations: ['Ningo', 'Old Ningo'] },
  { ethnic: 'PRAMPRAM', label: 'Prampram', weight: 5, locations: ['Prampram', 'Dawhenya'] },
  { ethnic: 'OSUDOKU', label: 'Osudoku', weight: 4, locations: ['Osudoku', 'Asutuare', 'Akosombo'] },
];

export const DIASPORA_LOCATIONS = [
  'London, UK', 'Toronto, Canada', 'New York, USA', 'Washington DC, USA',
  'Atlanta, USA', 'Hamburg, Germany', 'Amsterdam, Netherlands', 'Berlin, Germany',
] as const;

export const OCCUPATIONS = [
  'Software Developer', 'Banker', 'Accountant', 'Teacher', 'Journalist',
  'Radio Presenter', 'Photographer', 'Musician', 'Graphic Designer',
  'Trader (Makola)', 'Fashion Designer', 'Seamstress', 'Fisherman',
  'Fishmonger', 'Farmer', 'Nurse', 'Doctor', 'Civil Engineer',
  'Construction Supervisor', 'Commercial Driver (trotro)', 'Hotel Manager',
  'Tour Guide', 'Restaurant Owner', 'Caterer', 'Entrepreneur', 'Student',
  'Tailor', 'Auto Mechanic', 'Community Health Worker', 'Diaspora Nurse',
  'Logistics Officer', 'Traditional Caterer', 'Bead Artisan', 'Kente Weaver',
] as const;

export const INTERESTS = [
  'Ga History', 'Dangme History', 'Language Learning', 'Homowo', 'Ngmayem',
  'Asafotufiam', 'Dipo', 'Traditional Music', 'Gospel Music', 'Football',
  'Cooking', 'Kenkey & Fish', 'Bead Making', 'Krobo Beads', 'Photography',
  'Business', 'Fashion', 'Kente', 'Kpanlogo', 'Klama',
  'Youth Development', 'Church', 'Fishing', 'Farming', 'Travel', 'Diaspora Life',
] as const;

export const LANGUAGES = [
  'Ga', 'Dangme', 'English', 'Twi', 'Pidgin', 'Hausa', 'Ewe',
] as const;

export const AGE_BANDS = [
  { band: '18-24', weight: 20, min: 18, max: 24 },
  { band: '25-34', weight: 35, min: 25, max: 34 },
  { band: '35-44', weight: 20, min: 35, max: 44 },
  { band: '45-54', weight: 15, min: 45, max: 54 },
  { band: '55+', weight: 10, min: 55, max: 72 },
] as const;

export const BIZ_CATEGORIES = [
  'RESTAURANT', 'FASHION', 'FOOD_VENDOR', 'EVENT_SERVICES', 'PHOTOGRAPHY',
  'TRANSPORT', 'PROFESSIONAL', 'ARTISAN', 'TOURISM', 'CATERING',
  'DIGITAL', 'LOCAL_SHOP',
] as const;

export type GaDangmeName = { fullName: string; username: string; gender: 'MALE' | 'FEMALE'; ethnic: EthnicGroup; community: string; location: string };
