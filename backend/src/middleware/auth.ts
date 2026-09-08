import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccessToken, loadAuthUser, type AuthUser } from '../services/tokens.js';
import { ApiError } from '../utils/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = (req as any).cookies?.[process.env.REFRESH_COOKIE_NAME ?? 'gadv_refresh'];
  // Access token may also arrive via cookie in web flows
  const accessCookie = (req as any).cookies?.gadv_access;
  return header ? null : (accessCookie ?? cookie ?? null);
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized());
  verifyAccessToken(token)
    .then((payload) => loadAuthUser(payload.sub))
    .then((user) => {
      req.authUser = user;
      next();
    })
    .catch(next);
};

export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  verifyAccessToken(token)
    .then((payload) => loadAuthUser(payload.sub))
    .then((user) => {
      req.authUser = user;
      next();
    })
    .catch(() => next());
};

type Role = AuthUser['role'];
const ROLE_RANK: Record<Role, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.authUser;
    if (!user) return next(ApiError.unauthorized());
    if (!roles.includes(user.role)) return next(ApiError.forbidden('Insufficient role'));
    next();
  };
}

export function requireRoleAtLeast(min: Role): RequestHandler {
  return (req, _res, next) => {
    const user = req.authUser;
    if (!user) return next(ApiError.unauthorized());
    if (ROLE_RANK[user.role] < ROLE_RANK[min]) return next(ApiError.forbidden('Insufficient role'));
    next();
  };
}

/** Interactive actions require a verified email (Google accounts are pre-verified). */
export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  const user = req.authUser;
  if (!user) return next(ApiError.unauthorized());
  if (!user.email_verified) {
    return next(new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email address to continue'));
  }
  next();
};

export const errorHandler: (err: unknown, req: Request, res: Response, _next: NextFunction) => void =
  (err, req, res, _next) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    // Multer errors
    const anyErr = err as any;
    if (anyErr?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Uploaded file is too large' } });
      return;
    }
    if (anyErr?.code === 'ER_DUP_PKEY' || anyErr?.code === '23505' || anyErr?.code === '23505') {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Duplicate record' } });
      return;
    }
    console.error(`[error] ${req.method} ${req.path}`, err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  };

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
}
