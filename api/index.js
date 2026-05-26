/**
 * Vercel Serverless Entry Point
 * All /api/* requests are routed here by vercel.json.
 * Socket.IO is disabled (no persistent connections in serverless).
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';

import authRoutes from '../backend/src/routes/auth.js';
import whatsappRoutes from '../backend/src/routes/whatsapp.js';
import slackRoutes from '../backend/src/routes/slack.js';
import gmailRoutes from '../backend/src/routes/gmail.js';
import googleChatRoutes from '../backend/src/routes/googleChat.js';
import messagesRoutes from '../backend/src/routes/messages.js';
import settingsRoutes from '../backend/src/routes/settings.js';
import { configurePassport } from '../backend/src/config/passport.js';
import { runMigrations } from '../backend/src/migrations/run.js';

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();

// ── Session store: Redis if available, memory otherwise ───────────────────────
async function buildSessionStore() {
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
  if (redisUrl) {
    try {
      const { createClient } = await import('redis');
      const { RedisStore } = await import('connect-redis');
      const client = createClient({ url: redisUrl });
      await client.connect();
      console.log('Session store: Redis');
      return new RedisStore({ client });
    } catch (err) {
      console.warn('Redis unavailable, falling back to memory store:', err.message);
    }
  }
  console.log('Session store: memory (sessions lost on cold start)');
  return undefined; // express-session defaults to MemoryStore
}

// Migrations run once per cold start (idempotent)
let _ready = false;
async function ensureReady(store) {
  if (_ready) return;
  try { await runMigrations(); } catch (e) { console.warn('Migration warning:', e.message); }
  _ready = true;
}

// ── Middleware factory (deferred until session store is ready) ─────────────────
let _app = null;

async function getApp() {
  if (_app) return _app;

  const store = await buildSessionStore();
  await ensureReady();

  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS: on Vercel, frontend and API share the same origin, so CORS is only
  // needed when FRONTEND_URL differs (e.g., custom domain on frontend only).
  const origins = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origins.length === 0 || origins.includes(origin)) return cb(null, true);
      cb(null, true); // permissive — tighten in production if needed
    },
    credentials: true
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(session({
    store,
    secret: process.env.SESSION_SECRET || 'nexus-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());
  configurePassport(passport);

  app.use('/api/auth', authRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/slack', slackRoutes);
  app.use('/api/gmail', gmailRoutes);
  app.use('/api/google-chat', googleChatRoutes);
  app.use('/api/messages', messagesRoutes);
  app.use('/api/settings', settingsRoutes);

  app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', store: store ? 'redis' : 'memory', ts: new Date().toISOString() })
  );

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  _app = app;
  return app;
}

// Vercel calls this handler for every request
export default async function handler(req, res) {
  const application = await getApp();
  return application(req, res);
}
