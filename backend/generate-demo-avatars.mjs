/**
 * Generate colorful initial-avatars (SVG) for every seeded member into
 * web/public/avatars/<username>.svg — the app serves them at
 * /app/avatars/<username>.svg and the API assigns them to demo users.
 * Run: node generate-demo-avatars.mjs
 */
import fs from 'fs';
import path from 'path';

const root = 'C:/Users/I AM/Documents/Datila/GADAVIRAL';
const users = JSON.parse(fs.readFileSync(path.join(root, 'scripts/exports/users.json'), 'utf8'));
const outDir = path.join(root, 'web/public/avatars');
fs.mkdirSync(outDir, { recursive: true });

// Ga/Dangme-flavoured palette: gold, lagoon blue, kente green, clay, purple…
const palettes = [
  ['#F2A900', '#B87A00'], ['#1E88E5', '#0B4F9E'], ['#E91E63', '#9C1240'],
  ['#43A047', '#1B6E2B'], ['#8E24AA', '#5B1270'], ['#FF7043', '#C2491B'],
  ['#26C6DA', '#0F7E8C'], ['#5C6BC0', '#2F3F8F'], ['#D4A017', '#8C6B0F'],
  ['#66BB6A', '#2E7D32'], ['#AB47BC', '#6A1B9A'], ['#FFA726', '#E65100'],
];

const hash = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; };
const initials = (name) => (name || '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase().replace(/[^A-Z]/g, '') || 'GA';

let count = 0;
for (const u of users) {
  const p = palettes[hash(u.username) % palettes.length];
  const ini = initials(u.full_name || u.username);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/>`
    + `</linearGradient></defs>`
    + `<rect width="160" height="160" fill="url(#g)"/>`
    + `<text x="80" y="98" font-family="Segoe UI, Arial, sans-serif" font-size="54" font-weight="700" fill="#ffffff" text-anchor="middle">${ini}</text>`
    + `</svg>`;
  fs.writeFileSync(path.join(outDir, `${u.username}.svg`), svg);
  count++;
}
console.log('generated ' + count + ' avatars into web/public/avatars/');
