import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const trustProxy = process.env.TRUST_PROXY === 'true';

/** General API limiter. */
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { trustProxy: false },
});

/** Stricter limiter for authentication endpoints (brute-force protection). */
export const authLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  max: config.rateLimit.authMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } },
  validate: { trustProxy: false },
});

/** OTP / verification resend limiter. */
export const otpLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many verification requests. Try again later.' } },
  validate: { trustProxy: false },
});

/** Registration limiter (abuse prevention). */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many registrations from this address.' } },
  validate: { trustProxy: false },
});

export const limiterOptions = { trustProxy };
