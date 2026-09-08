import { randomInt, pick, shuffled } from '../src/utils/crypto.js';
import {
  GA_MALE_GIVEN, GA_FEMALE_GIVEN, GA_SURNAMES,
  DANGME_SURNAMES, DANGME_MALE_GIVEN, DANGME_FEMALE_GIVEN,
  COMMUNITIES, DIASPORA_LOCATIONS, OCCUPATIONS, INTERESTS, LANGUAGES,
  AGE_BANDS, type EthnicGroup,
} from './data/names.js';

export interface DemoIdentity {
  fullName: string; username: string; email: string; password: string;
  gender: 'MALE' | 'FEMALE';
  ethnic: EthnicGroup | 'UNSPECIFIED';
  community: string; location: string; hometown: string; occupation: string;
  interests: string[]; languages: string[]; age: number; bio: string;
  isDiaspora: boolean;
  persona: 'ACTIVE' | 'MODERATE' | 'LOW' | 'LURKER';
  createdAt: Date;
}

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28);

function weightedBand(): { min: number; max: number } {
  const roll = randomInt(0, 100);
  let acc = 0;
  for (const b of AGE_BANDS) { acc += b.weight; if (roll < acc) return { min: b.min, max: b.max }; }
  return { min: 25, max: 34 };
}

function personaRoll(): DemoIdentity['persona'] {
  const r = randomInt(0, 100);
  if (r < 25) return 'ACTIVE';
  if (r < 70) return 'MODERATE';
  if (r < 90) return 'LOW';
  return 'LURKER';
}

function communityRoll(): (typeof COMMUNITIES)[number] {
  const total = COMMUNITIES.reduce((n, c) => n + c.weight, 0);
  const roll = randomInt(0, total);
  let acc = 0;
  for (const spec of COMMUNITIES) { acc += spec.weight; if (roll < acc) return spec; }
  return COMMUNITIES[0];
}

function buildGaName(gender: 'MALE' | 'FEMALE', used: Set<string>): string {
  for (let attempt = 0; attempt < 400; attempt++) {
    const given = gender === 'MALE' ? pick(GA_MALE_GIVEN) : pick(GA_FEMALE_GIVEN);
    const surname = pick(GA_SURNAMES);
    const title = gender === 'MALE' ? 'Nii' : 'Naa';
    const full = randomInt(0, 10) < 7 ? `${title} ${given} ${surname}` : `${title} ${surname}`;
    if (!used.has(full)) { used.add(full); return full; }
  }
  throw new Error('Could not generate unique Ga name');
}

function buildDangmeName(gender: 'MALE' | 'FEMALE', used: Set<string>): string {
  for (let attempt = 0; attempt < 400; attempt++) {
    const given = gender === 'MALE' ? pick(DANGME_MALE_GIVEN) : pick(DANGME_FEMALE_GIVEN);
    const surname = pick(DANGME_SURNAMES);
    const royal = randomInt(0, 10) === 0 ? (gender === 'MALE' ? 'Nene ' : 'Manye ') : '';
    const full = `${royal}${given} ${surname}`;
    if (!used.has(full)) { used.add(full); return full; }
  }
  throw new Error('Could not generate unique Dangme name');
}

const BIO_TEMPLATES = [
  'Proud {ethnic} from {home}. {job} by day, culture keeper always.',
  '{home} born and raised. Love my people, our food and our festivals. {job}.',
  'Keeping our traditions alive one day at a time. {job} based in {city}.',
  'Family first, community always. {job} from {home}. Ask me about our festivals.',
  'Diaspora {ethnic} reconnecting with home. {job}. Welcome to my page!',
  'Our language is our soul. Learning, teaching, sharing. {job} in {city}.',
];

export function buildIdentities(count: number, diasporaCount: number): DemoIdentity[] {
  const usedNames = new Set<string>();
  const usedUsernames = new Set<string>();
  const identities: DemoIdentity[] = [];
  let diasporaLeft = diasporaCount;

  for (let i = 0; i < count; i++) {
    const gender: 'MALE' | 'FEMALE' = randomInt(0, 2) === 0 ? 'MALE' : 'FEMALE';
    const isDiaspora = diasporaLeft > 0 && randomInt(0, count - i) < diasporaLeft;
    if (isDiaspora) diasporaLeft--;

    const spec = communityRoll();
    const isGa = spec.ethnic === 'GA';
    const fullName = isGa ? buildGaName(gender, usedNames) : buildDangmeName(gender, usedNames);

    let base = slug(fullName);
    if (base.length < 3) base = `${base}_gh`;
    let username = base;
    if (usedUsernames.has(username)) {
      username = `${base}_gh`;
      let n = 2;
      while (usedUsernames.has(username)) username = `${base}_${n++}`;
    }
    usedUsernames.add(username);

    const band = weightedBand();
    const location = isDiaspora ? pick(DIASPORA_LOCATIONS) : pick(spec.locations);
    const hometown = pick(spec.locations);
    const occupation = pick(OCCUPATIONS);
    const interests = shuffled([...INTERESTS]).slice(0, randomInt(2, 6));
    const languages = [isGa ? 'Ga' : 'Dangme', 'English', ...shuffled(LANGUAGES).slice(0, randomInt(0, 2))]
      .filter((v, idx, arr) => arr.indexOf(v) === idx);
    const bio = pick(BIO_TEMPLATES)
      .replace('{ethnic}', isGa ? 'Ga' : 'Dangme')
      .replace('{home}', hometown)
      .replace('{city}', location.split(',')[0])
      .replace('{job}', occupation);
    const created = new Date(Date.UTC(2024, randomInt(0, 24), randomInt(1, 28), randomInt(7, 22), randomInt(0, 59), randomInt(0, 59)));

    identities.push({
      fullName, username, email: `${username}@demo.gadaviral.test`,
      password: `Demo-${randomInt(100000, 999999)}!`,
      gender, ethnic: spec.ethnic, community: spec.label,
      location, hometown, occupation, interests, languages, age: randomInt(band.min, band.max + 1), bio,
      isDiaspora, persona: personaRoll(), createdAt: created,
    });
  }
  return identities;
}

/** The single generic (non-Ga/Dangme) DEMO test account (spec §65). */
export function buildGenericDemoIdentity(): DemoIdentity {
  return {
    fullName: 'GADAVIRAL Demo Tester', username: 'demo_tester',
    email: 'demo.tester@gadaviral.test', password: 'Demo-Tester-2026!',
    gender: 'MALE', ethnic: 'UNSPECIFIED', community: 'Test',
    location: 'Accra (Test)', hometown: 'Testville', occupation: 'QA Tester (fictional)',
    interests: ['Testing', 'Feedback', 'Product'], languages: ['English'],
    age: 30,
    bio: 'Generic test account for GADAVIRAL. Not a Ga or Dangme persona — used to test features end to end.',
    isDiaspora: false, persona: 'ACTIVE', createdAt: new Date(Date.UTC(2026, 3, 15, 10, 30, 0)),
  };
}
