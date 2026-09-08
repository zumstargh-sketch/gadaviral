import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { asyncHandler, validateBody } from '../utils/http.js';
import { ApiError } from '../utils/errors.js';
import { signState, verifyState, randomToken } from '../utils/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import * as pwd from '../services/authPassword.js';
import * as acct from '../services/authAccount.js';
import { googleAuthUrl, googleCallback, googleIdTokenSignIn } from '../services/authGoogle.js';
import { loadAuthUser } from '../services/tokens.js';
import { sql } from '../db/client.js';

const router = Router();

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

// ─── Password reset & account security ─────────────────────────────
router.post('/forgot-password', authLimiter, validateBody(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => {
    const result = await pwd.requestPasswordReset(req.body.email);
    res.json(result);
  }));

router.post('/reset-password', authLimiter, validateBody(z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
})), asyncHandler(async (req, res) => {
  const result = await pwd.resetPassword(req.body.token, req.body.password);
  res.json(result);
}));

router.post('/change-password', requireAuth, validateBody(z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
})), asyncHandler(async (req, res) => {
  const result = await acct.changePassword(req.authUser!.id, req.body.currentPassword, req.body.newPassword);
  res.json(result);
}));

router.post('/change-email', requireAuth, validateBody(z.object({
  newEmail: z.string().email(),
  currentPassword: z.string().min(1),
})), asyncHandler(async (req, res) => {
  const result = await acct.requestEmailChange(req.authUser!.id, req.body.newEmail, req.body.currentPassword);
  res.json(result);
}));

router.get('/confirm-email', asyncHandler(async (req, res) => {
  const token = String(req.query.token ?? '');
  if (!token) throw ApiError.badRequest('Confirmation token is required');
  const result = await acct.confirmEmailChange(token);
  if (req.accepts(['html', 'json']) === 'json') res.json(result);
  else res.redirect(`${config.webAppUrl}/settings?emailConfirmed=1`);
}));

// ─── Google OAuth / OIDC ───────────────────────────────────────────
router.get('/google/url', asyncHandler(async (_req, res) => {
  const state = signState({ nonce: randomToken(8) }, config.jwt.accessSecret);
  res.json({ url: googleAuthUrl(state), state });
}));

router.get('/google/callback', asyncHandler(async (req, res) => {
  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  // The website may live on its own origin (www.gadaviral.com) while the API
  // runs elsewhere (e.g. Render) — redirect to the website origin (WEB_APP_URL).
  const redirect = (path: string) => res.redirect(`${config.webAppUrl}${path}`);
  if (!code || !state || !verifyState(state, config.jwt.accessSecret)) {
    return redirect('/login?google=state_error');
  }
  try {
    const result = await googleCallback(code, sessionMeta(req));
    setRefreshCookie(res, result.tokens.refreshToken);
    const params = new URLSearchParams({
      accessToken: result.tokens.accessToken,
      isNew: String(result.isNewUser),
      needsProfile: String(result.needsProfileCompletion),
    });
    return redirect(`/auth/google/complete?${params.toString()}`);
  } catch (e: any) {
    return redirect(`/login?google=error&reason=${encodeURIComponent(e?.message ?? 'failed')}`);
  }
}));

router.post('/google/idtoken', authLimiter, validateBody(z.object({
  idToken: z.string().min(10),
  platform: z.enum(['WEB', 'ANDROID', 'DESKTOP']).optional(),
})), asyncHandler(async (req, res) => {
  const result = await googleIdTokenSignIn(req.body.idToken, sessionMeta(req));
  setRefreshCookie(res, result.tokens.refreshToken);
  res.json({
    user: result.user,
    isNewUser: result.isNewUser,
    linked: result.linked,
    needsProfileCompletion: result.needsProfileCompletion,
    ...result.tokens,
  });
}));

// ─── Current user ──────────────────────────────────────────────────
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await loadAuthUser(req.authUser!.id);
  const profile = await sql`SELECT * FROM profiles WHERE user_id = ${user.id}`;
  res.json({ user, profile: profile[0] ?? null });
}));

export default router;
