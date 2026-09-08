import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { asyncHandler, validateBody } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { signState, verifyState, randomToken } from '../utils/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, otpLimiter, registerLimiter } from '../middleware/rateLimit.js';
import * as core from '../services/authCore.js';
import * as verify from '../services/authVerify.js';
import * as pwd from '../services/authPassword.js';
import * as acct from '../services/authAccount.js';
import { login, logout } from '../services/authLogin.js';
import { googleAuthUrl, googleCallback, googleIdTokenSignIn } from '../services/authGoogle.js';
import { loadAuthUser } from '../services/tokens.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  fullName: z.string().min(2).max(80),
  username: z.string().regex(/^[a-z0-9_]{3,30}$/).optional(),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });
const otpSchema = z.object({ email: z.string().email(), otp: z.string().regex(/^\d{6}$/) });

function sessionMeta(req: any) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined };
}

function setRefreshCookie(res: any, refreshToken: string) {
  res.cookie(config.jwt.refreshCookie, refreshToken, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: config.jwt.refreshTtl * 1000,
    path: '/api/v1/auth',
  });
}

// ─── Registration & email verification ─────────────────────────────
router.post('/register', registerLimiter, validateBody(registerSchema), asyncHandler(async (req, res) => {
  const result = await core.register(req.body);
  res.status(202).json(result);
}));

router.get('/verify-email', asyncHandler(async (req, res) => {
  const token = String(req.query.token ?? '');
  if (!token) throw ApiError.badRequest('Verification token is required');
  const result = await verify.verifyEmailByToken(token);
  if (req.accepts(['html', 'json']) === 'json') {
    res.json({ verified: true, ...result });
  } else {
    // The website may live on its own origin (e.g. www.gadaviral.com while the
    // API runs on Render) — always send the browser to the website.
    res.redirect(`${config.webAppUrl}/verified?email=${encodeURIComponent(result.email)}`);
  }
}));

router.post('/verify-otp', otpLimiter, validateBody(otpSchema), asyncHandler(async (req, res) => {
  const result = await verify.verifyEmailByOtp(req.body.email, req.body.otp);
  res.json({ verified: true, ...result });
}));

router.post('/resend-verification', otpLimiter, validateBody(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => {
    const result = await core.resendVerification(req.body.email);
    res.json(result);
  }));

// ─── Sessions ──────────────────────────────────────────────────────
router.post('/login', authLimiter, validateBody(loginSchema), asyncHandler(async (req, res) => {
  const result = await login(req.body.email, req.body.password, sessionMeta(req));
  if (result.tokens) setRefreshCookie(res, result.tokens.refreshToken);
  res.json({
    user: result.user,
    needsVerification: result.needsVerification,
    accessToken: result.tokens?.accessToken,
    refreshToken: result.tokens?.refreshToken,
    expiresIn: result.tokens?.expiresIn,
  });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.body?.refreshToken ?? req.cookies?.[config.jwt.refreshCookie];
  if (!token || typeof token !== 'string') throw ApiError.unauthorized('Refresh token required');
  const { rotateRefreshToken, signAccessToken, loadAuthUser } = await import('../services/tokens.js');
  const rotated = await rotateRefreshToken(token, sessionMeta(req));
  const user = await loadAuthUser(rotated.userId);
  const accessToken = await signAccessToken(user);
  setRefreshCookie(res, rotated.refreshToken);
  res.json({ user, accessToken, refreshToken: rotated.refreshToken, expiresIn: config.jwt.accessTtl });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.body?.refreshToken ?? req.cookies?.[config.jwt.refreshCookie];
  const authHeader = req.headers.authorization;
  let userId: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { verifyAccessToken } = await import('../services/tokens.js');
      userId = (await verifyAccessToken(authHeader.slice(7))).sub;
    } catch { /* logout must succeed regardless */ }
  }
  await logout(typeof token === 'string' ? token : undefined, userId);
  res.clearCookie(config.jwt.refreshCookie, { path: '/api/v1/auth' });
  res.json({ message: 'Logged out' });
}));

export default router;
