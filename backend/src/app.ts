import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { config } from './config.js';
import { api } from './modules/index.js';
import { errorHandler, notFoundHandler } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { storage } from './services/media.js';
import { ensureMediaAtBoot } from './utils/seedMedia.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', process.env.TRUST_PROXY === 'true');

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // The SPA relies on inline style attributes (React) and needs a permissive
    // policy; enforce a strict CSP at the reverse proxy in production if desired.
    contentSecurityPolicy: false,
  }));
  app.use(cors((req, cb) => {
    const origin = req.headers.origin;
    if (!origin) return cb(null, { origin: true, credentials: true });
    if (config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) {
      return cb(null, { origin: true, credentials: true });
    }
    // The API serves the website itself (same origin) — on localhost:4000, the
    // tunnel or a LAN address. Same-origin requests always carry their own
    // Host header as Origin, so allow those dynamically.
    try {
      if (new URL(origin).host === req.headers.host) {
        return cb(null, { origin: true, credentials: true });
      }
    } catch { /* malformed origin header */ }
    cb(new Error('Not allowed by CORS'));
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  if (!config.isTest) app.use(morgan('dev'));

  // Serve media (seed media + uploads). Seed files live in storage/seed-media
  // but are documented/served under /media/seed/* (splash + auth pages and the
  // seeded posts' images depend on these URLs).
  app.use(`${config.storage.publicBase}/seed`, express.static(path.resolve(config.storage.localDir, 'seed-media'), {
    maxAge: '7d', fallthrough: true,
  }));
  app.use(config.storage.publicBase, express.static(path.resolve(config.storage.localDir), {
    maxAge: '7d', fallthrough: true,
  }));

  app.use('/api/v1', apiLimiter, api);

  // API docs (works from src/ via tsx and from dist/src/ when compiled)
  const docCandidates = [
    path.resolve(__dirname, '../openapi.yaml'),
    path.resolve(__dirname, '../../openapi.yaml'),
  ];
  const docPath = docCandidates.find((c) => fs.existsSync(c));
  if (docPath) {
    const doc = YAML.parse(fs.readFileSync(docPath, 'utf8'));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(doc));
    app.get('/api/openapi.json', (_req, res) => res.json(doc));
  }

  // ─── Website (SPA) ────────────────────────────────────────────────────
  // When the built website exists, serve it from THIS origin so the entire
  // product (website + API + media + realtime) runs from a single URL — this
  // is also what the Android WebView and Windows shell load.
  const webDistCandidates = [
    process.env.WEB_DIST_DIR,
    path.resolve(__dirname, '../../web/dist'),   // running from backend/src (tsx)
    path.resolve(__dirname, '../../../web/dist'), // running from backend/dist/src
    path.resolve(process.cwd(), '../web/dist'),   // cwd = backend
    path.resolve(process.cwd(), 'web/dist'),      // cwd = repo root
  ].filter((c): c is string => !!c);
  const webDist = webDistCandidates.find((c) => fs.existsSync(path.join(c, 'index.html')));

  if (webDist) {
    app.use(express.static(webDist, { maxAge: '1h' }));
    // SPA fallback: every non-API GET renders the app (client-side routing)
    app.get(/^\/(?!api\/|media\/|socket\.io\/).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({ service: 'GADAVIRAL API', docs: '/api/docs', health: '/api/v1/health' });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

// ensure storage root exists at boot, and bootstrap seed/uploaded media into
// the runtime storage dir when it is a mounted production volume
ensureMediaAtBoot();
