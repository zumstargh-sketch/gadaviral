# Deploying the GADAVIRAL API to Render

Production target: **Render Web Service → Render PostgreSQL** (the existing
database — never reset, never recreated). The PC backend, Cloudflare tunnel and
localhost are no longer part of production.

```
GADAVIRAL Website (www.gadaviral.com) ─┐
Android app (APK)                     ─┼─► Render API (this service) ─► Render PostgreSQL
Windows app (WebView2)                ─┘           │
                                              /media/* (Persistent Disk)
```

## 1. Render Web Service settings

| Setting | Value |
|---|---|
| Type | Web Service |
| Repository | the GADAVIRAL GitHub repo |
| **Root Directory** | `backend` |
| Runtime | Node |
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npm run start:prod` (= `node dist/src/db/migrate.js up && node dist/src/index.js`) |
| **Health Check Path** | `/api/v1/health` |
| Instance | Free works, but media uploads need a Persistent Disk → Starter (or higher) for production |
| Port | Render injects `PORT` — the app listens on it, bound to `0.0.0.0` |

Notes:

- The start command applies pending SQL migrations via the existing runner
  (`src/db/migrate.ts` → `schema_migrations` table). It is **idempotent and
  additive only** — it never resets or drops anything. There is no Prisma in
  this backend, so there is no `prisma generate`/`migrate deploy`/`migrate reset`.
- On paid plans you can instead put the migrate step in a **Pre-Deploy Command**:
  `node dist/src/db/migrate.js up` and use plain `node dist/src/index.js` as Start.

## 2. Environment variables (Render dashboard → Environment)

Copy the values from your local `backend/.env` (they already point at the Render
Postgres instance). Required:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |
| `PORT` | `10000` (or leave unset — Render injects it) |
| `DATABASE_URL` | the **exact existing** Render PostgreSQL internal/external URL from `backend/.env` |
| `DATABASE_SSL` | `true` |
| `DB_POOL_MAX` | `10` |
| `API_BASE_URL` | `https://YOUR-RENDER-BACKEND-URL.onrender.com` (used in email links) |
| `WEB_APP_URL` | `https://www.gadaviral.com` (CORS + OAuth/email redirect target) |
| `CORS_ORIGINS` | `https://www.gadaviral.com,https://gadaviral.com,http://localhost:4000,http://localhost:5173` |
| `JWT_ACCESS_SECRET` | same strong secret as the rest of the stack (keeps existing sessions valid) |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` / `REFRESH_COOKIE_NAME` | defaults (`900` / `2592000` / `gadv_refresh`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | existing web client values |
| `GOOGLE_CALLBACK_URL` | `https://YOUR-RENDER-BACKEND-URL.onrender.com/api/v1/auth/google/callback` |
| `GOOGLE_ANDROID_CLIENT_ID` / `GOOGLE_DESKTOP_CLIENT_ID` | existing values (ID-token flow, no callback needed) |
| `GOOGLE_HD` | empty |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` | existing SMTP credentials (env-only, never committed) |
| `SMTP_FROM_EMAIL` | `admin@gadaviral.com` |
| `SMTP_FROM_NAME` | `GADAVIRAL` |
| `SMTP_DEV_MODE` | `false` (dev outbox endpoint also self-404s when `NODE_ENV=production`) |
| `STORAGE_DRIVER` | `local` |
| `STORAGE_LOCAL_DIR` | `/opt/data/storage` (with Persistent Disk; see §3) |
| `STORAGE_PUBLIC_BASE` | `/media` |
| `MAX_UPLOAD_MB` | `25` |
| `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_*`, `EMAIL_*` | defaults are fine |
| `FCM_*`, `MODERATION_*` | optional, when configured |

## 3. Media storage

`backend/storage/` currently holds ~8 MB (2,333 generated seed images + 4
uploaded files). Both are **committed to the repo**, and at boot the server
copies anything missing into `STORAGE_LOCAL_DIR` (`src/utils/seedMedia.ts`,
idempotent — never overwrites/deletes).

- Render's default filesystem is **ephemeral**: uploads would vanish on every
  deploy. For permanent uploads, attach a **Persistent Disk** (requires a paid
  instance): Mount path `/opt/data`, size 1 GB is plenty to start.
- With `STORAGE_LOCAL_DIR=/opt/data/storage`: seed media is bootstrapped onto
  the disk automatically; new uploads (avatars, covers, post media) persist
  across deploys.
- Existing media references in the DB (`/media/images/...`,
  `/media/seed/...`) keep working unchanged — URLs are origin-relative.
- Backups: `pg_dump` + copy of the mounted disk.

## 4. Google OAuth

Google Cloud Console → API & Services → Credentials → **Web application**
client:

- Authorized redirect URIs — **add**:
  `https://YOUR-RENDER-BACKEND-URL.onrender.com/api/v1/auth/google/callback`
  (keep `http://localhost:4000/api/v1/auth/google/callback` for local dev).
- Authorized JavaScript origins: `https://www.gadaviral.com`,
  `http://localhost:5173`.

The Android/Windows flows use ID tokens (`GOOGLE_ANDROID_CLIENT_ID`,
`GOOGLE_DESKTOP_CLIENT_ID`) and need no callback URI.

## 5. Website & apps

- **Website**: build with the API origin — `VITE_API_BASE=https://YOUR-RENDER-BACKEND-URL.onrender.com npm run build`
  — then deploy `web/dist/` to your web host for `www.gadaviral.com`. API calls,
  token refresh and realtime sockets go straight to the Render API (CORS above).
- **Android**: rebuild the APK with
  `gradlew -PAPI_BASE_URL=https://YOUR-RENDER-BACKEND-URL.onrender.com assembleRelease`.
- **Windows**: defaults to `https://www.gadaviral.com`; no change if the
  website stays on that domain.

## 6. Verify after first deploy

1. `curl https://YOUR-RENDER-BACKEND-URL.onrender.com/api/v1/health` →
   `{"status":"healthy","db":"ok",...}`
2. `curl -I https://YOUR-RENDER-BACKEND-URL.onrender.com/media/seed/...` → 200
3. Register/login from the website; email arrives from `admin@gadaviral.com`.
4. `/api/v1/dev/outbox` must return **404** in production.
5. Migrations: build log shows `database is up to date` (existing DB untouched).
