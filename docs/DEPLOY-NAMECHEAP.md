# Deploying GADAVIRAL to your hosting (replacing / sitting beside WordPress)

**Why gadaviral.com currently shows WordPress:** the old WordPress site is what
your hosting serves today. The GADAVIRAL app (website + API) is a Node.js
application + built static frontend in this repository — it must be uploaded to
the host once, following the steps below. Nothing in the code needs to change.

The app is deployed as **one Node.js service** that serves everything from a
single origin:

```
https://your-host  →  Node app (backend)
   /                →  website SPA (web/dist — upload the built folder)
   /api/v1/*        →  REST API
   /media/*         →  images/uploads
   /socket.io/*     →  realtime
```

## Option A — subdomain first (safest, keeps WordPress at www)

1. **Build locally** (on your PC):
   ```powershell
   cd web;  npx vite build        # produces web/dist
   cd ..\backend; npm run build   # produces backend/dist
   ```
2. **Create a database** — cPanel → *PostgreSQL Databases*: create `gadaviral`
   + user, grant all. Note the connection string:
   `postgres://USER:PASSWORD@127.0.0.1:5432/gadaviral`
3. **cPanel → Setup Node.js App**:
   - Node version: 20+
   - Application root: `gadaviral` (folder in your home dir)
   - Application URL: create/choose `app.gadaviral.com` (subdomain)
   - Application startup file: `dist/src/index.js`
4. **Upload** the repo to that folder (cPanel File Manager zip upload, or Git):
   - `backend/` (including `dist/`, `migrations/`, `package.json`)
   - `web/dist/`
5. In the Node.js App page: **Environment variables**
   ```
   NODE_ENV=production
   PORT=4000                      (cPanel assigns one — use theirs)
   DATABASE_URL=postgres://...    (from step 2)
   JWT_ACCESS_SECRET=<64 random chars>
   WEB_APP_URL=https://app.gadaviral.com
   CORS_ORIGINS=https://app.gadaviral.com
   SMTP_HOST=mail.gadaviral.com
   SMTP_USER=admin@gadaviral.com
   SMTP_PASSWORD=<mailbox password>
   SMTP_FROM_EMAIL=admin@gadaviral.com
   SMTP_FROM_NAME=GADAVIRAL
   GOOGLE_CLIENT_ID=...           GOOGLE_CLIENT_SECRET=...
   GOOGLE_CALLBACK_URL=https://app.gadaviral.com/api/v1/auth/google/callback
   ```
   Then **Run NPM Install**, then open the cPanel terminal →
   `cd ~/gadaviral/backend && npm run migrate && npm run seed:demo` and
   **Restart** the app.
6. **Google OAuth**: add `https://app.gadaviral.com` to the authorized origins
   and the callback URL above to the redirect URIs (docs/GOOGLE-AUTH-SETUP.md).

## Option B — replace the WordPress homepage entirely

Same as Option A but point the **main domain** at the Node app instead of a
subdomain: in cPanel the Node app's Application URL can be the domain; if the
domain's document root currently contains WordPress, move WordPress to a
folder/subdomain (e.g. `old.gadaviral.com`) and set the app root as the
domain's document root (cPanel → Domains → document root), or proxy:
`.htaccess` in public_html → `RewriteRule ^(.*)$ http://127.0.0.1:PORT/$1 [P]`
(requires mod_proxy — available on most Namecheap plans).

> Shared-hosting note: cPanel Node apps run via Passenger. If PostgreSQL is
> not included in your plan, use a free managed Postgres (Neon/Supabase) and
> set `DATABASE_SSL=true`.

## After deploying

- `npm run create-admin -- admin@gadaviral.com "GADAVIRAL Admin" "<password>"`
- Rebuild the Android app against the real host:
  `gradlew -PAPI_BASE_URL=https://app.gadaviral.com assembleDebug`
- The Windows app already defaults to `https://www.gadaviral.com` — once the
  app is live on the main domain it works with zero changes.

## Phone testing WITHOUT hosting (today)

Run the stack on your PC and open a free Cloudflare quick tunnel:

```powershell
powershell -File scripts\tunnel.ps1     # prints a public https URL
# then rebuild the APK with that URL:
cd android; gradlew.bat -PAPI_BASE_URL=<printed-url> assembleDebug
```

Quick-tunnel URLs are temporary (they change each run) — use them for testing;
use Option A/B for the real deployment.
