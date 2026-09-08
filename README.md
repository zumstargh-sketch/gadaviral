# GADAVIRAL — Ga & Dangme Online Social Community

One connected ecosystem: **Website + Backend/API + PostgreSQL + Android + Windows**, all sharing a single backend and database.

- Brand color system: gold `#F2A900` / black `#0B0B0D` / wave blue `#1E88E5`
- Official site: https://www.gadaviral.com
- Auth email sender: `admin@gadaviral.com`

## Feature overview

| Area | Highlights |
|---|---|
| Auth | Email+password (scrypt), **genuine Google OAuth/OIDC** (web code flow + Android/Windows ID-token flow, server-side JWKS verification, secure account linking), email verification (link + hashed OTP), password reset, email change, sessions with refresh rotation, RBAC (USER/MODERATOR/ADMIN/SUPER_ADMIN) |
| Social | Posts (text/photo/video/poll) with visibility, 6 reaction types (unique per user), threaded comments/replies, real share records, follows, blocks/mutes, notifications (realtime via Socket.IO), private messaging, groups (15 cultural communities), events + RSVP, pages, business directory |
| Discovery | Unified search, trending feed filters, cursor pagination everywhere |
| Safety | Server-side moderation (profanity/hate/spam → masked/rejected/review queue), reports with categories, admin moderation with audit trail |
| Admin | Dashboard: analytics, user management (suspend/ban/verify), report queue, flagged content, audit log, **demo data: stats/validation/regenerate/delete-all** |
| Demo data | 116 fictional Ga/Dangme users (authentic name pools, ~14 diaspora) + 1 generic DEMO account + exactly 150 posts (May 2026 → 7 Sep 2026, Accra time, realistic hours + festival clustering), full interaction graph within spec caps, every row tagged `is_demo/seed_batch`, one-command wipe/regenerate |

## Repository layout

```
backend/    Node.js + TypeScript API (Express 5), PostgreSQL, migrations, seeds, 45+ tests, OpenAPI docs
web/        React + Vite website (social app + admin dashboard)
android/    Kotlin Android app  -> GADAVIRAL.apk
windows/    WPF + WebView2 app  -> GADAVIRAL.exe
branding/   Official logo (PNG) + icon generator for web/Windows/Android
docs/       SETUP · DEPLOYMENT · GOOGLE-AUTH-SETUP · EMAIL-CONFIGURATION · SECURITY-CHECKLIST · TESTING · DEMO-DATA · API
scripts/    Developer helpers
```

## Quick start (development)

Requirements: Node 20+ (24 recommended). No local PostgreSQL needed — a dev
embedded PostgreSQL is provided (or point `DATABASE_URL` at your own server).

```bash
# 1. Backend
cd backend
npm install
copy .env.example .env        # Windows (use `cp` on macOS/Linux)
npm run dev:db                # boots embedded PostgreSQL (persistent)
npm run migrate               # applies SQL migrations
npm run dev                   # API + full website on http://localhost:4000
                              #   (app at "/", docs at /api/docs, health: /api/v1/health)

# 2. Demo data (116 Ga/Dangme profiles + 1 generic DEMO account + 150 posts)
npm run seed:demo             # idempotent; use --force to wipe & regenerate
npm run demo:verify           # validates every seed rule from the spec

# 3. Website
cd ../web
npm install
npm run dev                   # http://localhost:5173 (proxies /api to :4000)

# 4. Windows app  (see windows/README.md)   -> dotnet publish => GADAVIRAL.exe
# 5. Android app  (see android/README.md)   -> gradlew  => GADAVIRAL.apk
# 6. Tests:  cd backend && npm test
# 7. First admin:  cd backend && npm run create-admin -- admin@gadaviral.com "Name" "Password123!"
```

## Documentation

- `docs/SETUP.md` — full setup incl. embedded PostgreSQL, admin bootstrap
- `docs/API.md` — endpoint reference (interactive: `/api/docs`)
- `docs/GOOGLE-AUTH-SETUP.md` — Google Cloud console, OAuth clients, SHA-1, linking rules
- `docs/EMAIL-CONFIGURATION.md` — SMTP for `admin@gadaviral.com`, SPF/DKIM/DMARC
- `docs/SECURITY-CHECKLIST.md` — implemented controls + go-live checklist
- `docs/TESTING.md` — suite map to spec, email/Google test matrices, E2E smoke test
- `docs/DEMO-DATA.md` — seed system, caps, validation, wipe/regenerate
- `docs/DEPLOYMENT.md` — VPS (nginx + systemd/pm2) and Namecheap paths, backups

