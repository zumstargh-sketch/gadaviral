import { Router } from 'express';
import { sql } from '../db/client.js';
import { asyncHandler } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { storage, validateMime, kindFromMime } from '../services/media.js';
import { upload } from '../middleware/upload.js';

const router = Router();

async function saveImageOr400(req: any): Promise<string> {
  const file = req.file;
  if (!file) throw ApiError.badRequest('Image file required (field name: image)');
  if (kindFromMime(file.mimetype) !== 'IMAGE') throw ApiError.badRequest('Only images are allowed');
  validateMime(file.mimetype, 'IMAGE');
  return (await storage.save(file.buffer, file.originalname, file.mimetype)).url;
}

router.post('/me/avatar', requireAuth, upload.single('image'), asyncHandler(async (req, res) => {
  const url = await saveImageOr400(req);
  await sql`
    INSERT INTO profiles (user_id, avatar_url) VALUES (${req.authUser!.id}, ${url})
    ON CONFLICT (user_id) DO UPDATE SET avatar_url = EXCLUDED.avatar_url`;
  await audit(req.authUser!.id, 'AVATAR_UPLOADED', 'user', req.authUser!.id);
  res.json({ url });
}));

router.post('/me/cover', requireAuth, upload.single('image'), asyncHandler(async (req, res) => {
  const url = await saveImageOr400(req);
  await sql`
    INSERT INTO profiles (user_id, cover_url) VALUES (${req.authUser!.id}, ${url})
    ON CONFLICT (user_id) DO UPDATE SET cover_url = EXCLUDED.cover_url`;
  await audit(req.authUser!.id, 'COVER_UPLOADED', 'user', req.authUser!.id);
  res.json({ url });
}));

export default router;
