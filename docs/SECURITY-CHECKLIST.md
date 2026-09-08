# Security Checklist (spec §26, §90)

## Authentication & sessions
- [x] Passwords: scrypt (N=16384, r=8, p=1, 64-byte key) with per-user salt; timing-safe comparison
- [x] JWT access tokens: HS256, 15 min TTL, issuer/audience pinned
- [x] Refresh tokens: 256-bit random, SHA-256 stored, 30-day TTL, **single-use rotation**; replay revokes the whole family
- [x] HttpOnly refresh cookie (`SameSite=Lax`, `Secure` in production, scoped to `/api/v1/auth`)
- [x] Email verification required before interactive actions (`EMAIL_NOT_VERIFIED`)
- [x] Google OIDC: server-side JWKS verification (signature/exp/iss/aud per platform), stable `sub`, verified-email linking only
- [x] OAuth state: HMAC-signed, 10-minute expiry (web flow)
- [x] Anti-enumeration on register/login/forgot-password
- [x] OTP: hashed storage, 6-digit crypto-random, 10 min, 5 attempts, 60 s resend cooldown
- [x] Rate limiting: general API (300/min), auth (20/15 min), OTP (10/10 min), register (20/h)
- [x] Account status: SUSPENDED/BANNED/DEACTIVATED block login & tokens

## Authorization
- [x] RBAC: USER < MODERATOR < ADMIN < SUPER_ADMIN (enforced in middleware)
- [x] Admin endpoints: admin+ only; role changes: super admin only
- [x] Google login never grants elevated roles
- [x] Every admin action + auth event recorded in `audit_logs`

## Input & transport
- [x] Parameterized SQL everywhere (postgres.js) — no string-concatenated queries
- [x] Zod validation on all mutating endpoints
- [x] Helmet security headers; CORS allow-list (`CORS_ORIGINS`)
- [x] Upload safety: MIME allow-list, size cap (25 MB), random filenames, path-traversal-safe static serving
- [x] JSON body limit 2 MB; pagination limits (max 100)

## Content safety
- [x] Server-side moderation on posts/comments/replies/bios/messages/group & business text:
  profanity masking, hate/threat/sexual → REJECTED, spam/link heuristics → PENDING_REVIEW queue
- [x] Reports → moderation queue with resolve/remove/dismiss + audit trail
- [x] Blocks remove mutual follows and hide authors from feeds; mutes supported

## Production TODO (checklist for go-live)
- [ ] Set `NODE_ENV=production`, strong `JWT_ACCESS_SECRET` (≥64 random chars)
- [ ] HTTPS everywhere (TLS terminator / reverse proxy), `TRUST_PROXY=true` behind a proxy
- [ ] Real SMTP credentials + SPF/DKIM/DMARC verified (see EMAIL-CONFIGURATION.md)
- [ ] `SMTP_DEV_MODE=false`
- [ ] Restrict `CORS_ORIGINS` to your real origins
- [ ] Configure Google OAuth production credentials + consent screen published
- [ ] Backups: nightly `pg_dump` of the database + media directory
- [ ] Consider Redis-backed rate limiting when scaling beyond one instance
- [ ] Review audit_logs and reports regularly in the Admin dashboard
