# Deployment Guide

## Architecture

```
Browser/Android/Windows ──► Reverse proxy (HTTPS)
                              ├── /            → web/dist (SPA static files)
                              ├── /api/*       → Node API (backend, port 4000)
                              ├── /media/*     → backend storage/ (or S3)
                              └── /socket.io/* → backend (websocket upgrade)
                                        │
                                  PostgreSQL 14+
```

All clients share this single backend + database.

## A) VPS (recommended — Ubuntu 22.04 example)

```bash
# 1. System
sudo apt update && sudo apt install -y nginx postgresql certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs

# 2. Database
sudo -u postgres psql -c "CREATE USER gadaviral WITH PASSWORD '<strong-password>';"
sudo -u postgres psql -c "CREATE DATABASE gadaviral OWNER gadaviral;"

# 3. Backend
sudo useradd -m -s /bin/bash gadaviral && sudo -iu gadaviral
git clone <your repo> gadaviral && cd gadaviral/backend
npm ci
cp .env.example .env   # fill in production values (NODE_ENV=production, real SMTP, Google, strong JWT secret)
npm run migrate
npm run build && npm run start   # or run under pm2: npm i -g pm2 && pm2 start dist/src/index.js --name gadaviral-api

# 4. Website
cd ../web && npm ci && npm run build
sudo rsync -a dist/ /var/www/gadaviral/

# 5. Nginx site
sudo tee /etc/nginx/sites-available/gadaviral <<'EOF'
server {
  listen 443 ssl http2;
  server_name www.gadaviral.com gadaviral.com;
  ssl_certificate     /etc/letsencrypt/live/gadaviral.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/gadaviral.com/privkey.pem;
  client_max_body_size 30m;

  root /var/www/gadaviral;
  index index.html;
  location / { try_files $uri /index.html; }

  location /api/     { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
  location /media/   { proxy_pass http://127.0.0.1:4000; }
  location /socket.io/ { proxy_pass http://127.0.0.1:4000; proxy_http_version 1.1;
                         proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
}
EOF
sudo certbot --nginx -d gadaviral.com -d www.gadaviral.com
```

Set `TRUST_PROXY=true` in the backend env so rate-limiter sees real client IPs.

## B) Namecheap shared hosting

Shared cPanel supports Node apps (Setup Node.js App):
1. Upload the repo; create the app for `backend/` (startup `dist/src/index.js`),
   Node 20+, install dependencies.
2. PostgreSQL: shared hosts rarely include it — use a free/cheap managed
   Postgres (e.g. Neon/Supabase/Railway) and put its URL in `DATABASE_URL`
   (set `DATABASE_SSL=true`).
3. The SPA can be served from cPanel static hosting at the domain root, with
   `/api` proxied via cPanel's "Application root" mapping, or set the website to
   call the API origin directly (update `CORS_ORIGINS`).
4. Configure the Google OAuth redirect + CORS accordingly.

## C) Backups

```bash
# nightly cron
pg_dump gadaviral | gzip > /var/backups/gadaviral-$(date +\%F).sql.gz
# plus copy backend/storage/ (uploads + seed media)
```

## D) Releases

- Backend: `npm run build` → `dist/src/index.js`; `npm run migrate` on deploy.
- Website: `npx vite build` → deploy `dist/`.
- Windows: `dotnet publish -c Release -r win-x64 -o publish` → `GADAVIRAL.exe`.
- Android: `gradlew assembleRelease` (sign with your keystore) → `GADAVIRAL.apk`.
