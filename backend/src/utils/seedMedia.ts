import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

/**
 * Media bootstrap for production volumes.
 *
 * The repo ships the seed media (generated avatars/covers/post images) and any
 * already-uploaded files under backend/storage/. When the runtime storage
 * directory (STORAGE_LOCAL_DIR) points at a mounted volume — e.g. Render
 * Persistent Disk at /opt/data/storage — this copies anything missing from the
 * repo copy into the volume at boot. Idempotent: existing files are never
 * overwritten or deleted, so user uploads on the volume always survive.
 */
export function ensureMediaAtBoot(): { copied: number; skipped: number } {
  const targetRoot = path.resolve(config.storage.localDir);
  fs.mkdirSync(targetRoot, { recursive: true });

  // repo copy always lives at <backend>/storage, whatever the layout:
  //  - src/utils      → ../../storage   (tsx/dev + tests)
  //  - dist/src/utils → ../../../storage (compiled production)
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../storage'),
    path.resolve(here, '../../../storage'),
    path.resolve(process.cwd(), 'storage'),
  ];
  const repoRoot = candidates.find((c) => fs.existsSync(path.join(c, 'seed-media'))) ?? candidates[0];
  let copied = 0;
  let skipped = 0;

  if (repoRoot === targetRoot) return { copied, skipped };

  for (const dir of ['seed-media', 'images']) {
    const srcDir = path.resolve(repoRoot, dir);
    const dstDir = path.join(targetRoot, dir);
    if (!fs.existsSync(srcDir)) continue;
    fs.mkdirSync(dstDir, { recursive: true });
    copyMissing(srcDir, dstDir);
  }

  function copyMissing(src: string, dst: string) {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(d, { recursive: true });
        copyMissing(s, d);
      } else if (fs.existsSync(d)) {
        skipped++;
      } else {
        fs.copyFileSync(s, d);
        copied++;
      }
    }
  }

  if (copied > 0) console.log(`[media] bootstrapped ${copied} file(s) into ${targetRoot}`);
  return { copied, skipped };
}