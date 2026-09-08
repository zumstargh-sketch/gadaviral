import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { ApiError } from '../utils/errors.js';

/**
 * Media storage abstraction. Local driver by default; the same interface can
 * be implemented for S3/Cloudinary in production (see docs/deployment.md).
 */
export interface StorageDriver {
  save(buffer: Buffer, originalName: string, mime: string): Promise<{ url: string; path: string }>;
  absolutePath(urlPath: string): string | null;
}

const root = path.resolve(config.storage.localDir);

function safeExt(name: string): string {
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext.length > 1 && ext.length <= 6 ? ext : '';
}

function subdirFor(mime: string): string {
  if (mime.startsWith('image/')) return 'images';
  if (mime.startsWith('video/')) return 'videos';
  if (mime.startsWith('audio/')) return 'audio';
  return 'files';
}

class LocalDriver implements StorageDriver {
  async save(buffer: Buffer, originalName: string, mime: string) {
    const sub = subdirFor(mime);
    const dir = path.join(root, sub);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${safeExt(originalName)}`;
    const abs = path.join(dir, name);
    fs.writeFileSync(abs, buffer);
    const url = `${config.storage.publicBase}/${sub}/${name}`;
    return { url, path: abs };
  }
  absolutePath(urlPath: string): string | null {
    if (!urlPath.startsWith(config.storage.publicBase)) return null;
    const rel = urlPath.slice(config.storage.publicBase.length).replace(/^\/+/, '');
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root)) return null;
    return abs;
  }
}

export const storage: StorageDriver = new LocalDriver();

export function validateMime(mime: string, kind: 'IMAGE' | 'VIDEO' | 'AUDIO') {
  const allowed =
    kind === 'IMAGE' ? config.storage.allowedImageMime
    : kind === 'VIDEO' ? config.storage.allowedVideoMime
    : ['audio/mpeg', 'audio/mp4', 'audio/wav'];
  if (!allowed.includes(mime)) {
    throw ApiError.badRequest(`File type ${mime} is not allowed for ${kind}`, { allowed });
  }
}

export function assertSize(sizeBytes: number) {
  const max = config.storage.maxUploadMb * 1024 * 1024;
  if (sizeBytes > max) throw ApiError.payload(`File exceeds ${config.storage.maxUploadMb}MB limit`);
}

export function kindFromMime(mime: string): 'IMAGE' | 'VIDEO' | 'AUDIO' {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  throw ApiError.badRequest(`Unsupported media type: ${mime}`);
}

/** Optional thumbnail generation via sharp (when installed). Never blocks upload. */
export async function tryThumbnail(buffer: Buffer): Promise<{ thumb: Buffer | null; width?: number; height?: number }> {
  try {
    const mod = await import('sharp').catch(() => null);
    if (!mod) return { thumb: null };
    const sharp = mod.default;
    const meta = await sharp(buffer).metadata();
    const thumb = await sharp(buffer).rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78 }).toBuffer();
    return { thumb, width: meta.width, height: meta.height };
  } catch {
    return { thumb: null };
  }
}
