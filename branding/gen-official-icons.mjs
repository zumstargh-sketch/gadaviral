/**
 * GADAVIRAL official icon generator — renders every icon from the OFFICIAL
 * uploaded logo (branding/gadaviral-logo.png). No synthetic drawing.
 *   node branding/gen-official-icons.mjs     (uses sharp from backend deps)
 * Writes: branding/icons/*, web/public/icons/*, windows/Assets/*, android mipmaps
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, 'gadaviral-logo.png');
const OUT = path.resolve(__dirname, 'icons');
const sharp = createRequire(path.resolve(__dirname, '../backend/package.json'))('sharp');

if (!fs.existsSync(SRC)) { console.error('Official logo not found: ' + SRC); process.exit(1); }

// ── minimal PNG encoder (only for ICO containers) ────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
async function rawAt(size) {
  const { data, info } = await sharp(SRC).resize(size, size, { fit: 'cover', position: 'centre' })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: Buffer.from(data), w: info.width, h: info.height };
}
function icoFrom(sizes, raws) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + sizes.length * 16;
  const entries = [], pngs = [];
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i]; const png = encodePng(raws[i].w, raws[i].h, raws[i].rgba);
    const e = Buffer.alloc(16);
    e[0] = s < 256 ? s : 0; e[1] = s < 256 ? s : 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
    entries.push(e); pngs.push(png); offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...pngs]);
}
const sq = (size) => sharp(SRC).resize(size, size, { fit: 'cover', position: 'centre' }).png().toBuffer();
const round = (size) => sharp(SRC).resize(size, size, { fit: 'cover', position: 'centre' })
  .composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`), blend: 'dest-in' }])
  .png().toBuffer();

// ── write everything ─────────────────────────────────────────────────
const SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512];

fs.mkdirSync(OUT, { recursive: true });
for (const s of SIZES) fs.writeFileSync(path.join(OUT, `icon-${s}.png`), await sq(s));
fs.writeFileSync(path.join(OUT, 'favicon.ico'), icoFrom([16, 32, 48], await Promise.all([16, 32, 48].map(rawAt))));
fs.writeFileSync(path.join(OUT, 'favicon-32.png'), await sq(32));

const webIcons = path.resolve(__dirname, '../web/public/icons');
fs.mkdirSync(webIcons, { recursive: true });
for (const s of SIZES) fs.copyFileSync(path.join(OUT, `icon-${s}.png`), path.join(webIcons, `icon-${s}.png`));
fs.copyFileSync(path.join(OUT, 'favicon.ico'), path.join(webIcons, 'favicon.ico'));
fs.copyFileSync(path.join(OUT, 'favicon-32.png'), path.join(webIcons, 'favicon-32.png'));
// full official logo (512px) for splash/header use — master stays in branding/
fs.writeFileSync(path.join(webIcons, 'logo-512.png'), await sharp(SRC).resize(512, 512, { fit: 'cover', position: 'centre' }).png().toBuffer());

const winDir = path.resolve(__dirname, '../windows/Assets');
fs.mkdirSync(winDir, { recursive: true });
fs.writeFileSync(path.join(winDir, 'gadaviral.ico'), icoFrom([16, 32, 48, 256], await Promise.all([16, 32, 48, 256].map(rawAt))));
fs.writeFileSync(path.join(winDir, 'gadaviral.png'), await sq(256));

const mipmap = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [dpi, s] of Object.entries(mipmap)) {
  const dir = path.resolve(__dirname, '../android/app/src/main/res', `mipmap-${dpi}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), await sq(s));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), await round(s));
}
console.log('official icons written from:', SRC);