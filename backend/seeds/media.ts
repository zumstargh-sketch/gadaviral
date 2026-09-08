import fs from 'node:fs';
import path from 'node:path';

/**
 * Generates self-made (royalty-free, spec §53/§81) SVG media for the demo seed:
 * avatars (initials on brand colours), covers, and themed post images.
 * Written under <backend>/storage/seed-media and served from /media/seed/...
 */
export const SEED_MEDIA_DIR = path.resolve('storage/seed-media');

const AVATAR_PALETTES = [
  ['#F2A900', '#0B0B0D'], ['#1E88E5', '#FFFFFF'], ['#E65100', '#FFFFFF'],
  ['#2E7D32', '#FFFFFF'], ['#6A1B9A', '#FFFFFF'], ['#00838F', '#FFFFFF'],
  ['#C62828', '#FFFFFF'], ['#37474F', '#F2A900'], ['#F9A825', '#0B0B0D'],
  ['#AD1457', '#FFFFFF'],
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Rich gradient pairs for avatar backgrounds (paired by name hash → stable per person). */
const AVATAR_GRADIENTS: Array<[string, string]> = [
  ['#F2A900', '#B45309'], // gold → bronze
  ['#1E88E5', '#0B3D91'], // wave blue → navy
  ['#E65100', '#BF360C'], // orange → deep orange
  ['#2E7D32', '#1B5E20'], // green
  ['#6A1B9A', '#4A148C'], // purple
  ['#00838F', '#006064'], // teal
  ['#C62828', '#7F1D1D'], // red
  ['#37474F', '#263238'], // slate
  ['#F9A825', '#F57F17'], // amber
  ['#AD1457', '#880E4F'], // rose
  ['#0277BD', '#01579B'], // sky
  ['#5D4037', '#3E2723'], // kente brown
];

function nameHash(name: string): number {
  let h = 7;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return h;
}

export function initialsOf(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

/** Circular gradient avatar with initials — rasterized to PNG by saveAvatar(). */
export function avatarSvg(initials: string, name: string): string {
  const [c1, c2] = AVATAR_GRADIENTS[nameHash(name) % AVATAR_GRADIENTS.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="256" height="256" rx="128" fill="url(#g)"/>
<circle cx="128" cy="128" r="118" fill="none" stroke="#FFFFFF" stroke-opacity="0.30" stroke-width="5"/>
<text x="128" y="161" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="800"
 fill="#FFFFFF" text-anchor="middle">${esc(initials)}</text></svg>`;
}

export function coverSvg(label: string, seed: number): string {
  const [fg, bg] = AVATAR_PALETTES[(seed + 3) % AVATAR_PALETTES.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#0B0B0D"/><stop offset="1" stop-color="${bg}"/></linearGradient></defs>
<rect width="1200" height="400" fill="url(#g)"/>
<path d="M0 320 Q 300 260 600 320 T 1200 320 V400 H0 Z" fill="${fg}" opacity="0.85"/>
<text x="600" y="180" font-family="Arial" font-size="44" font-weight="bold" fill="#FFFFFF"
 text-anchor="middle">${esc(label)}</text></svg>`;
}

const THEME_ART: Record<string, string[]> = {
  food: ['kenkey plate with pepper', '#F9A825', '#BF360C'],
  festival: ['festival drums and colours', '#E65100', '#4E342E'],
  diaspora: ['skyline and kente ribbon', '#1E88E5', '#0B0B0D'],
  business: ['market stall sunrise', '#2E7D32', '#0B0B0D'],
  music: ['kpanlogo drums', '#6A1B9A', '#0B0B0D'],
  youth: ['community sports field', '#00838F', '#0B0B0D'],
  church: ['chorus hands raised', '#37474F', '#F2A900'],
  travel: ['coast at golden hour', '#F2A900', '#01579B'],
  history: ['adinkra-inspired pattern', '#8D6E63', '#0B0B0D'],
  jobs: ['tools and notebook', '#455A64', '#0B0B0D'],
  language: ['letters of the alphabet', '#AD1457', '#FFF8E1'],
  announcement: ['community notice board', '#0277BD', '#ECEFF1'],
};

export function postImageSvg(category: string, seed: number): string {
  const theme = THEME_ART[category] ?? ['gadaviral community', '#F2A900', '#0B0B0D'];
  const [label, c1, c2] = theme;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
<defs><linearGradient id="g${seed}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient></defs>
<rect width="960" height="540" fill="url(#g${seed})"/>
${waves(seed)}
<circle cx="${480 + (seed % 5) * 40}" cy="150" r="70" fill="#F2A900" opacity="0.9"/>
<text x="480" y="480" font-family="Arial" font-size="34" font-weight="bold" fill="#FFFFFF"
 text-anchor="middle">${esc(label)}</text></svg>`;
}

function waves(seed: number): string {
  const y = 300 + (seed % 4) * 18;
  return `<path d="M0 ${y} Q 240 ${y - 60} 480 ${y} T 960 ${y} V540 H0 Z" fill="#1E88E5" opacity="0.8"/>
<path d="M0 ${y + 40} Q 240 ${y - 20} 480 ${y + 40} T 960 ${y + 40} V540 H0 Z" fill="#0B0B0D" opacity="0.55"/>`;
}

export function writeSeedMedia(): void {
  fs.mkdirSync(path.join(SEED_MEDIA_DIR, 'avatars'), { recursive: true });
  fs.mkdirSync(path.join(SEED_MEDIA_DIR, 'covers'), { recursive: true });
  fs.mkdirSync(path.join(SEED_MEDIA_DIR, 'posts'), { recursive: true });
}

/**
 * Avatar = circular gradient + initials, rasterized to a 256px PNG via sharp
 * (real image everywhere: web, Android, Windows — no SVG-only rendering).
 * Falls back to writing the SVG itself if sharp is unavailable.
 */
export async function saveAvatar(name: string, seed: number): Promise<string> {
  const initials = initialsOf(name);
  const svg = avatarSvg(initials, name);
  const base = `avatars/a-${seed.toString(36)}`;
  try {
    const mod: any = await import('sharp');
    const sharp = mod.default ?? mod;
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 })
      .toFile(path.join(SEED_MEDIA_DIR, `${base}.png`));
    return `/media/seed/${base}.png`;
  } catch {
    fs.writeFileSync(path.join(SEED_MEDIA_DIR, `${base}.svg`), svg);
    return `/media/seed/${base}.svg`;
  }
}

export function saveCover(label: string, seed: number): string {
  const file = `covers/c-${seed.toString(36)}.svg`;
  fs.writeFileSync(path.join(SEED_MEDIA_DIR, file), coverSvg(label, seed));
  return `/media/seed/${file}`;
}

export function savePostImage(category: string, seed: number): string {
  const file = `posts/p-${seed.toString(36)}.svg`;
  fs.writeFileSync(path.join(SEED_MEDIA_DIR, file), postImageSvg(category, seed));
  return `/media/seed/${file}`;
}
