import multer from 'multer';
import { config } from '../config.js';
import { ApiError } from '../utils/errors.js';

const ALLOWED = new Set([
  ...config.storage.allowedImageMime,
  ...config.storage.allowedVideoMime,
  'audio/mpeg', 'audio/mp4', 'audio/wav',
]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxUploadMb * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(ApiError.badRequest(`File type ${file.mimetype} is not allowed`));
      return;
    }
    cb(null, true);
  },
});
