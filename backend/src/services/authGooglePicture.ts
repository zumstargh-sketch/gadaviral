import { config } from '../config.js';
import { storage } from './media.js';

/** Best-effort: copy the Google profile picture into GADAVIRAL storage (§12). */
export async function mirrorGooglePicture(
  pictureUrl: string | undefined,
  userId: string,
): Promise<string | null> {
  if (!pictureUrl) return null;
  try {
    const res = await fetch(pictureUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const mime = res.headers.get('content-type') ?? 'image/jpeg';
    if (!mime.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return null;
    const saved = await storage.save(buf, `google-${userId}.jpg`, mime);
    return saved.url;
  } catch {
    return null;
  }
}
