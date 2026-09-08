/**
 * Generates the bundled "seeded member" avatar PNGs shown on the Android
 * splash / sign-in / sign-up screens and the Windows splash — the same design
 * as the demo seed avatars (brand gradients + initials), built from the same
 * authentic Ga/Dangme name pools. Run from backend/: npx tsx scripts/gen-bundle-avatars.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { avatarSvg, initialsOf } from '../seeds/media.js';
import {
  GA_MALE_GIVEN, GA_FEMALE_GIVEN, GA_SURNAMES,
  DANGME_MALE_GIVEN, DANGME_FEMALE_GIVEN, DANGME_SURNAMES,
} from '../seeds/data/names.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const androidDir = path.join(root, 'android/app/src/main/res/drawable-nodpi');
const windowsDir = path.join(root, 'windows/Assets/avatars');
fs.mkdirSync(androidDir, { recursive: true });
fs.mkdirSync(windowsDir, { recursive: true });

/** 8 representative members from the same name pools the seeder uses. */
const people = [
  `Nii ${GA_MALE_GIVEN[0]} ${GA_SURNAMES[0]}`,
  `Naa ${GA_FEMALE_GIVEN[0]} ${GA_SURNAMES[1]}`,
  `Nene ${DANGME_MALE_GIVEN[0]} ${DANGME_SURNAMES[0]}`,
  `Manye ${DANGME_FEMALE_GIVEN[0]} ${DANGME_SURNAMES[1]}`,
  `Nii ${GA_MALE_GIVEN[1]} ${GA_SURNAMES[2]}`,
  `Naa ${GA_FEMALE_GIVEN[1]} ${GA_SURNAMES[3]}`,
  `${DANGME_MALE_GIVEN[1]} ${DANGME_SURNAMES[2]}`,
  `${DANGME_FEMALE_GIVEN[1]} ${DANGME_SURNAMES[3]}`,
];

for (let i = 0; i < people.length; i++) {
  const svg = avatarSvg(initialsOf(people[i]), people[i]);
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  // Android resource names: lowercase + underscores only.
  fs.writeFileSync(path.join(androidDir, `member_0${i + 1}.png`), png);
  fs.writeFileSync(path.join(windowsDir, `member-0${i + 1}.png`), png);
}
console.log(`bundled member avatars written: ${people.length} → android drawable-nodpi + windows/Assets/avatars`);