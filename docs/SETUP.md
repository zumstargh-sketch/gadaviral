# GADAVIRAL — Setup Guide

## Prerequisites
- **Node.js 20+** (24 recommended) — backend + website
- **PostgreSQL 14+** — local dev includes an embedded server (no install needed)
- **.NET 8/10 SDK** — only to build the Windows app
- **Android Studio / SDK + JDK 17** — only to build the Android app

## 1. Backend

```bash
cd backend
npm install
copy .env.example .env        # Windows  (mac/linux: cp .env.example .env)
```

Edit `.env` — minimum required:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | long random string (min 16 chars) |
| `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL` | Google sign-in (see GOOGLE-AUTH-SETUP.md) |
| `SMTP_*` | real SMTP credentials for `admin@gadaviral.com` (see EMAIL-CONFIGURATION.md) |

### Option A — embedded dev PostgreSQL (zero install)

```bash
npm run dev:db     # starts PostgreSQL 17 on :15432 (persistent, C:\ProgramData\GADAVIRAL\pg)
                   # keep this terminal/process running while developing
npm run migrate    # applies all SQL migrations
npm run dev        # API on http://localhost:4000 (docs: /api/docs, health: /api/v1/health)
```

> On this repository's Windows dev machine, port 5432 is blocked by Windows and the
> username contains a space, so the embedded server defaults to port **15432** and
> stores data in `C:\ProgramData\GADAVIRAL\pg`. The checked-in `.env` already matches.

### Option B — your own PostgreSQL

Point `DATABASE_URL` at any PostgreSQL 14+ instance, then `npm run migrate`.

## 2. Demo data (116 Ga/Dangme profiles + 1 generic + 150 posts)

```bash
npm run seed:demo           # first run
npm run demo:verify         # validates every rule from the spec (23 checks)
npm run seed:demo -- --force  # wipe + regenerate
npm run demo:wipe           # DELETE ALL DEMO DATA (real users never touched)
npm run demo:stats          # counts for the dashboard
```

## 3. Create the first admin (RBAC bootstrap)

```bash
npm run create-admin -- admin@gadaviral.com "GADAVIRAL Admin" "StrongPass123!"
```

Admin roles are **never** granted by Google sign-in — only via this script
(or a super admin promoting users in the dashboard).

## 4. Website

```bash
cd ../web
npm install
npm run dev        # http://localhost:5173 (proxies /api and /media to :4000)
npm run build      # production bundle in dist/
```

For production, either serve `web/dist` behind a reverse proxy that also forwards
`/api` + `/media` + `/socket.io` to the backend (single origin), or set the backend's
`CORS_ORIGINS` to the website domain and host the SPA separately.

## 5. Windows app

```bash
cd windows
dotnet build -c Release
dotnet publish -c Release -r win-x64 -o publish   # → publish/GADAVIRAL.exe
```

Default web app URL is `https://www.gadaviral.com`. For local development:

```powershell
$env:GADAVIRAL_WEB_APP_URL = "http://localhost:5173"; .\publish\GADAVIRAL.exe
```

Requires the Microsoft Edge **WebView2 Runtime** (pre-installed on Windows 11).

## 6. Android app

See `android/README.md`. Quick version:

```bash
cd android
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
gradlew.bat assembleDebug        # → app/build/outputs/apk/debug/app-debug.apk
```

Google sign-in on Android additionally needs `GOOGLE_SERVER_CLIENT_ID` in
`app/build.gradle.kts` plus the SHA-1 of your signing key registered in the
Google Cloud console (see GOOGLE-AUTH-SETUP.md).
