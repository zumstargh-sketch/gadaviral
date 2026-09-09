# GADAVIRAL — Namecheap Deployment Guide (WordPress architecture)

This is the **authoritative** deployment guide. The app is a static React SPA
served by Namecheap hosting; the backend/database is **WordPress**
(`gadaviral-api` plugin). There is **no** Node backend, PostgreSQL or Render
dependency in production.

```
LOCAL DEV      http://localhost:5173/app/  ──vite proxy──▶  https://staging.gadaviral.com/wp-json/gadaviral/v1/
STAGING        https://staging.gadaviral.com/app/          →  https://staging.gadaviral.com/wp-json/gadaviral/v1/
PRODUCTION     https://www.gadaviral.com/app/              →  https://www.gadaviral.com/wp-json/gadaviral/v1/
```

## 0. Production go-live fix (homepage white page — 2026-09)

Status found on https://www.gadaviral.com:

| Check | Result |
|---|---|
| `GET /` (homepage) | **Empty HTML (0 bytes) — the white page** |
| `GET /wp-json/gadaviral/v1/health` | **404 — the GADAVIRAL API plugin is not uploaded/activated in production** |
| `GET /app/` | SPA deployed (but pre-fix builds broke on refresh — fixed by the router change) |

Apply these three steps in order:

1. **Activate the GADAVIRAL API plugin in production** (without it the app has
   no data source). WP Admin (www.gadaviral.com) → Plugins → Add New → Upload
   Plugin → `wordpress/gadaviral-api/gadaviral-api.zip` → Install → **Activate**
   (activation creates all tables — non-destructive, `CREATE TABLE IF NOT EXISTS`).
   Verify: `curl https://www.gadaviral.com/wp-json/gadaviral/v1/health`
   → `{"ok":true,"source":"wordpress-gadaviral-api"}`

2. **Make the homepage show the app** — the root contains WordPress's
   `index.php` (its front page renders empty — that IS the white page). Do NOT
   delete or rename `index.php`, and the SPA's `app/index.html` stays where it
   is. Recommended:

   - **`.htaccess` block (recommended):** in cPanel File Manager enable
     *Settings → Show Hidden Files (dotfiles)*, download a backup copy of
     `/public_html/.htaccess`, then paste the block from
     `deploy/root-htaccess-addition.txt` **anywhere ABOVE the
     `# BEGIN WordPress` line** (if a `# BEGIN LSCACHE` block exists, leave it
     where it is — rule order relative to LiteSpeed's markers does not matter;
     what matters is that the GADAVIRAL block comes BEFORE WordPress's
     catch-all, whose `[L]` flag would otherwise swallow every request and
     keep serving the blank front page). A typical correct order is:
     `# BEGIN LSCACHE … # END LSCACHE → # BEGIN NON_LSCACHE … # END
     NON_LSCACHE → GADAVIRAL block → # BEGIN WordPress … # END WordPress`.
     The app then serves directly on the clean root URL; every WordPress path
     keeps working. This intercepts the request before `index.php` runs, so
     the blank WordPress front page is bypassed.
   - **Fallback (only if .htaccess cannot be edited):** create a new file
     `/public_html/index.html` with the contents of `deploy/root-index.html`
     (it redirects visitors to `/app/`) AND add this single line at the top of
     `.htaccess` so the HTML file is picked before WordPress's `index.php`:
     `DirectoryIndex index.html index.php`

   After editing, flush caches — the LiteSpeed manager location varies by
   setup: **WP Admin → LiteSpeed Cache → Toolbox → Flush All** (or the
   LiteSpeed icon in the top admin bar → *Purge All*), or in cPanel →
   **LiteSpeed Web Cache Manager → Flush All** when that icon exists. A stale
   empty cached response can otherwise keep showing at `/`. No LiteSpeed menu
   at all? Then nothing is page-cached — just test in a private/incognito
   window. While there, also add the API cache exclusion (see §3, step 5).

3. **Verify** from any machine:

   ```bash
   curl -s https://www.gadaviral.com/                 # → app HTML or redirect (no longer empty)
   curl -s https://www.gadaviral.com/wp-json/gadaviral/v1/health
   curl -s -o /dev/null -w "%{http_code}" https://www.gadaviral.com/app/feed   # → 200
   ```

The Windows app (`windows/`) loads `https://www.gadaviral.com/app/` directly,
so it works as soon as step 1 is done. Router note: the SPA derives its router
base from the URL (`/app` under `/app/`, `/` at the root), so refreshes and
deep links work in both locations.

## 1. What to upload (two artefacts)

| Artefact | Source in repo | Deploy package |
|---|---|---|
| Frontend SPA | `web/dist/` (built with `npm run build` in `web/`) | `web/dist.zip` |
| WordPress plugin | `wordpress/gadaviral-api/gadaviral-api.php` | `wordpress/gadaviral-api/gadaviral-api.zip` |

Rebuild/repackage any time:

```powershell
cd web; npm run build; cd ..
# Package with the files at the ROOT of the zip (extracting into /app/ must
# produce /app/index.html, /app/assets/, /app/icons/ — never a nested dist/):
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory("$PWD\web\dist", "$PWD\web\dist.zip")
Compress-Archive -Path wordpress\gadaviral-api\gadaviral-api.php -DestinationPath wordpress\gadaviral-api\gadaviral-api.zip -Force
```

## 2. PHP syntax validation (staging / server)

PHP CLI is not available on the dev workstation. On any machine with PHP
(Namecheap cPanel terminal has PHP), run:

```bash
php -l wordpress/gadaviral-api/gadaviral-api.php
# cPanel terminal equivalent:
php -l ~/public_html/staging/wp-content/plugins/gadaviral-api/gadaviral-api.php
```

Expected output: `No syntax errors detected`. WordPress also refuses to
activate plugin files with fatal parse errors, which acts as a second gate.

## 3. Staging deployment

Target paths on Namecheap (staging WP is installed under `/public_html/staging/`):

| File | Destination |
|---|---|
| `wordpress/gadaviral-api/gadaviral-api.php` | `/public_html/staging/wp-content/plugins/gadaviral-api/gadaviral-api.php` |
| contents of `web/dist/` | `/public_html/staging/app/` |

Steps (cPanel File Manager):

1. Upload `gadaviral-api.zip` to `/public_html/staging/wp-content/plugins/`
   and use "Extract", or paste the new file contents into the existing plugin
   via Plugins → Plugin Editor. **Do not delete unrelated files.**
2. WP Admin (staging) → Plugins → ensure **GADAVIRAL API** is Active
   (activation is non-destructive; it only runs `CREATE TABLE IF NOT EXISTS`).
3. Create folder `/public_html/staging/app/` and upload the contents of
   `web/dist/` (index.html, assets/, icons/).
4. SPA deep links need the `/app/` fallback — add
   `/public_html/staging/app/.htaccess` (copy of `deploy/app-htaccess.txt`):

   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /app/
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /app/index.html [L]
   </IfModule>
   ```

5. **Do NOT let LiteSpeed cache `/wp-json/gadaviral/v1/*` or `/app/index.html`**
   (stale/authenticated responses would be served to the wrong user). LiteSpeed
   Cache → Cache → Excludes: add `wp-json/gadaviral`.

## 4. Production deployment (Namecheap, www.gadaviral.com)

| File | Destination |
|---|---|
| `wordpress/gadaviral-api/gadaviral-api.php` | `/public_html/wp-content/plugins/gadaviral-api/gadaviral-api.php` |
| contents of `web/dist/` | `/public_html/app/` |
| `.htaccess` (SPA fallback, `RewriteBase /app/`) | `/public_html/app/.htaccess` |

1. **Backup first** (cPanel → Backup → Download a Full Account Backup, or
   WP-CLI: `wp db export backup-before-gadv-$(date +%F).sql`).
2. Upload the plugin file (overwrite only `gadaviral-api/gadaviral-api.php`).
   Do not touch any other production file.
3. Activate the plugin in WP Admin if it is not already active.
4. Upload `web/dist/*` into `/public_html/app/` (new folder; nothing existing
   is overwritten).
5. Add the `.htaccess` SPA fallback above.
6. Verify from any machine that can reach the site:

   ```bash
   curl -s https://www.gadaviral.com/wp-json/gadaviral/v1/health
   # → {"ok":true,"source":"wordpress-gadaviral-api"}
   curl -s -o /dev/null -w "%{http_code}" https://www.gadaviral.com/app/
   # → 200
   ```

7. Set a strong JWT secret once (WP-CLI): 
   `wp option update gadv_jwt_secret "$(openssl rand -hex 32)"`
   (If skipped, the plugin auto-generates and stores one on first use.)

## 5. Data migration (PostgreSQL → WordPress)

⚠️ **Never run against production without a backup.** All migration tooling is
**additive and idempotent** — it only inserts mapped rows, never drops/truncates.

| Step | Tool | Runs on |
|---|---|---|
| 1. Export old PostgreSQL | `node scripts/pg_export_example.js` (needs old `DATABASE_URL`) | dev machine with DB access |
| 2. Review mapping | `docs/DATABASE-MAPPING.md`, `scripts/mappings/DATABASE_TABLES_MAPPING.md` | — |
| 3. Import into WP | `wp eval-file scripts/wp_importer_runner.php` (or `.\scripts\run_wp_migration.ps1 -Step importer`) | server w/ WP-CLI |
| 4. Media fetch/import | `wp eval-file scripts/media_migrate_helper.php` (writes `scripts/media_mappings.json`) | server w/ WP-CLI |
| 5. Verify | row counts, one imported user login, `/posts`, `/community/highlights` | staging |

Full runbook: `docs/MIGRATION-GUIDE.md`. Nothing is deleted; re-running import
steps skips already-migrated rows via the mapping files.

## 6. Verification tooling

```powershell
# Route-compatibility audit (must stay 67/67):
node scripts/api_compat_test.js        # writes scripts/api_compat_report.json

# Live runtime verification (staging only; refuses production):
node scripts/staging_runtime_test.js --base https://staging.gadaviral.com
# authenticated flows need credentials (use a THROWAWAY staging user):
$env:GADV_TEST_EMAIL="..."; $env:GADV_TEST_PASSWORD="..."; node scripts/staging_runtime_test.js
```

The runtime test covers: health, posts (pagination meta), community highlights,
search, events, groups, businesses, auth guard, login, refresh + rotation,
old-token rejection, logout, revoked-token rejection, /auth/me (flat fields +
user/profile), POST /reports, protected GET, protected write, media upload and
a group create/join/leave round-trip.

