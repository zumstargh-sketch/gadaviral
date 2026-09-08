import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z, ZodError, ZodType } from 'zod';
import { ApiError } from './errors.js';

export function parsePagination(query: any, defaults = { page: 1, limit: 20 }) {
  const page = Math.max(1, parseInt(String(query?.page ?? defaults.page), 10) || defaults.page);
  const limit = Math.min(100, Math.max(1, parseInt(String(query?.limit ?? defaults.limit), 10) || defaults.limit));
  return { page, limit, offset: (page - 1) * limit };
}

export function paginated<T>(items: T[], total: number, page: number, limit: number) {
  return {
    items,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        next(ApiError.badRequest('Validation failed', e.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
      } else next(e);
    }
  };
}

export function validateQuery(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    try {
      (req as any).validatedQuery = schema.parse(req.query);
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        next(ApiError.badRequest('Invalid query parameters', e.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
      } else next(e);
    }
  };
}

export const uuidSchema = z.string().uuid();
