# Testing Guide (spec §95–99)

## Automated suite (backend)

```bash
cd backend
npm test            # vitest, 9 suites / 45 tests against the dev database
npm run dev &       # API must be running for the live smoke test
npx tsx tests/e2e-smoke.ts   # LIVE §99 end-to-end smoke: 37 checks
```

The live smoke test (`tests/e2e-smoke.ts`) exercises the real API + database:
register → verification email (OTP read from the dev outbox, wrong/correct/
reused code) → login → post → react (idempotency) → comment → threaded reply →
share → follow → poll vote → notifications → messaging (open/send/history) →
search → report → moderation queue → forgot/reset password (old password
rejected) → admin bootstrap + RBAC → analytics → **DELETE ALL DEMO DATA**
(demo counts hit 0, real user survives §101) → **REGENERATE DEMO DATA**
(117 users / 150 posts) → §98 validation. Exit code 0 = all 37 checks pass.

Coverage map to the spec:

| Suite | Verifies |
|---|---|
| `auth.test.ts` | register, duplicate-email rejection, login, wrong password, access+refresh, `/auth/me`, protected-route 401 (§95) |
| `auth2.test.ts` | email verify (link + OTP, wrong/expired/reused codes), resend cooldown, forgot/reset flow, old-password login rejection, sessions revoked, email change, anti-enumeration, rate limiting (§17–26, §97) |
| `google.test.ts` | mocked real JWKS: valid ID token → new account (verified), same `sub` → same account (no duplicates), verified-email linking to an existing password account, unverified email rejected, forged signature rejected, wrong audience rejected, expired token rejected (§7–9, §96) |
| `social.test.ts` | posts (text/media/poll), feed pagination, unique reaction per user (DB constraint), reaction switch/remove, comments, replies, comment limits, shares, shares counted, delete post cascades (§31–34) |
| `social2.test.ts` | follows (no self-follow, unique), follower lists, feed from following, notifications on react/comment/follow, blocks (unfollow + hidden from feed), report → moderation queue (§33–36, §43, §75) |
| `social3.test.ts` | groups (create/join/duplicate), group posts, events (create/attend/interested), poll vote (one per user, switch), vote counts, messaging (conversation reuse, send, read, list, block enforcement), search (users/posts/groups) (§36–41, §76) |
| `moderation.test.ts` | vulgar words masked, hate speech → REJECTED, spam → PENDING_REVIEW, clean content → PUBLISHED, moderation queue, remove/restore/dismiss with audit trail, RBAC (user cannot moderate) (§42–44) |
| `admin.test.ts` | RBAC deny USER, allow ADMIN, search users, suspend/ban/restore + login blocking, verify email, analytics counters, audit log entries (§44, §94) |
| `demo.test.ts` | demo wipe removes only demo rows (real user + real post survive), counts, demo-only constraints (§85, §101) |

Helpers create real users via the real API (`tests/helpers.ts`) — no mocks
except the Google token-signing key (a real RSA key served through a real
JWKS endpoint and pinned `iss` — identical verification code path to Google).

## Demo data validation (§98)

```bash
npm run demo:verify
```
23 checks — see `docs/DEMO-DATA.md`. Exit code 0 = all pass.

## Email testing checklist (§97)

1. Set real SMTP in `.env` (or keep `SMTP_DEV_MODE=true` and inspect `outbox_emails`).
2. Register → receive **GADAVIRAL <admin@gadaviral.com>** mail with VERIFY button + OTP.
3. Click link → verified; wrong OTP ×5 → locked; expired → error; reused link → error.
4. Resend works after 60 s; immediate resend → cooldown error.
5. Forgot password → reset email → set new password → old password rejected, other sessions revoked.
6. Change email → confirmation to the NEW address only.
7. Open all mails in Gmail + Outlook + mobile — template is table-based and client-safe.

## Google sign-in matrix (§96)

See the table in `docs/GOOGLE-AUTH-SETUP.md` — every row is automated in
`google.test.ts` except the live-device flows, which need real credentials:
follow that doc, then test web (browser), Android (device/emulator) and
Windows (WebView shell) against the same backend and confirm the same account
works everywhere.

## End-to-end smoke test (§99 short form)

```powershell
# 1) database + api
cd backend; npm run dev:db; npm run migrate; npm run dev
# 2) seed + validate
npm run seed:demo; npm run demo:verify
# 3) website
cd ../web; npm run dev        # register, verify (check outbox), post, react, comment, share, follow, DM, report
# 4) admin
npm run create-admin -- admin@gadaviral.com "Admin" "Password123!"
#    → Admin dashboard: analytics, suspend user, resolve report, demo stats, wipe + regenerate demo data
# 5) desktop: windows\publish\GADAVIRAL.exe (GADAVIRAL_WEB_APP_URL=http://localhost:5173) → same account works
# 6) android: install app-debug.apk → same account works → react on desktop → appears in app feed
```
