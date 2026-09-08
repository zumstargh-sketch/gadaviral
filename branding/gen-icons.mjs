/**
 * GADAVIRAL icon generator — pure Node (no deps), writes PNG + ICO from a
 * rasterized brand mark (gold G-ring + community dot + blue wave on black).
 *
 *   node branding/gen-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, 'icons');

// ── minimal PNG encoder ──────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ── brand mark rasterizer ────────────────────────────────────────────
const GOLD = [242, 169, 0], GOLD_HI = [255, 211, 77], BLACK = [8, 8, 10], BLUE = [30, 136, 229], BLUE_LT = [99, 179, 255];

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const put = (x, y, c, a = 255) => {
    const i = (y * size + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = a;
  };
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - r + 0.5, dy = y - r + 0.5;
      const d = Math.hypot(dx, dy);
      if (d > r) { put(x, y, [0, 0, 0], 0); continue; }
      let c = BLACK;
      const ang = Math.atan2(dy, dx);
      if (d <= r * 0.78 && d >= r * 0.52 && !(Math.abs(ang) < 0.55)) {
        c = d >= r * 0.74 ? GOLD_HI : GOLD;
      }
      if (Math.hypot(dx + r * 0.08, dy - r * 0.02) < r * 0.2) c = GOLD_HI;
      const waveY = r * 0.42 + Math.sin((x / size) * Math.PI * 2) * size * 0.05;
      if (y > waveY && y < waveY + size * 0.12 && d < r * 0.92) c = BLUE;
      if (y >= waveY + size * 0.12 && y < waveY + size * 0.16 && d < r * 0.92) c = BLUE_LT;
      put(x, y, c, 255);
    }
  }
  return encodePng(size, size, px);
}
export { drawIcon };

// ── BMP-inside-ICO writer ────────────────────────────────────────────
function bmpData(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const si = ((size - 1 - y) * size + x) * 4;
      const di = (y * size + x) * 4;
      pixels[di] = rgba[si + 2]; pixels[di + 1] = rgba[si + 1];
      pixels[di + 2] = rgba[si]; pixels[di + 3] = rgba[si + 3];
    }
  }
  const mask = Buffer.alloc(size * 4 * size);
  return Buffer.concat([header, pixels, mask]);
}

function buildIco(sizes) {
  const images = sizes.map((s) => ({ s, png: drawIcon(s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = [];
  const blobs = [];
  for (const img of images) {
    const e = Buffer.alloc(16);
    e[0] = img.s < 256 ? img.s : 0;
    e[1] = img.s < 256 ? img.s : 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    blobs.push(img.png);
    offset += img.png.length;
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

// ── write everything ─────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
for (const s of [16, 32, 48, 64, 128, 180, 192, 256, 512]) {
  fs.writeFileSync(path.join(OUT, `icon-${s}.png`), drawIcon(s));
}
fs.writeFileSync(path.join(OUT, 'favicon.ico'), buildIco([16, 32, 48]));

const winDir = path.resolve(__dirname, '../windows/Assets');
fs.mkdirSync(winDir, { recursive: true });
fs.writeFileSync(path.join(winDir, 'gadaviral.ico'), buildIco([16, 32, 48, 256]));
fs.writeFileSync(path.join(winDir, 'gadaviral.png'), drawIcon(256));

const mipmap = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [dpi, s] of Object.entries(mipmap)) {
  const dir = path.resolve(__dirname, '../android/app/src/main/res', `mipmap-${dpi}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), drawIcon(s));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), drawIcon(s));
}
console.log('icons written:', OUT);



