/**
 * Vercel Serverless Entry Point
 * All /api/* requests are routed here by vercel.json.
 * Socket.IO is disabled (no persistent connections in serverless).
 *
 * All route / config imports are DYNAMIC (inside getApp) so that any
 * missing module throws a caught, JSON-formatted error rather than
 * crashing the entire Lambda before the handler runs.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';

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
async function ensureReady() {
  if (_ready) return;
  try {
    const { runMigrations } = await import('../backend/src/migrations/run.js');
    await runMigrations();
  } catch (e) {
    console.warn('Migration warning:', e.message);
  }
  _ready = true;
}

// ── App factory (deferred until first request) ────────────────────────────────
const app = express();

// Zero-dependency ping — registered immediately, before any async init.
// Hits this even if getApp() hasn't finished yet by registering it on the
// express instance that handler() uses for all requests.
app.get('/api/ping', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

let _appReady = false;

async function getApp() {
  if (_appReady) return app;

  const store = await buildSessionStore();
  await ensureReady();

  app.use(helmet({ contentSecurityPolicy: false }));

  const origins = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({
    origin: (_origin, cb) => cb(null, true), // permissive — tighten in production if needed
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
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // ── Dynamic route imports — failures are caught by handler() ────────────────
  const [
    { default: authRoutes },
    { default: whatsappRoutes },
    { default: slackRoutes },
    { default: gmailRoutes },
    { default: googleChatRoutes },
    { default: messagesRoutes },
    { default: settingsRoutes },
    { configurePassport },
  ] = await Promise.all([
    import('../backend/src/routes/auth.js'),
    import('../backend/src/routes/whatsapp.js'),
    import('../backend/src/routes/slack.js'),
    import('../backend/src/routes/gmail.js'),
    import('../backend/src/routes/googleChat.js'),
    import('../backend/src/routes/messages.js'),
    import('../backend/src/routes/settings.js'),
    import('../backend/src/config/passport.js'),
  ]);

  configurePassport(passport);

  app.use('/api/auth', authRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/slack', slackRoutes);
  app.use('/api/gmail', gmailRoutes);
  app.use('/api/google-chat', googleChatRoutes);
  app.use('/api/messages', messagesRoutes);
  app.use('/api/settings', settingsRoutes);

  app.get('/api/health', async (_req, res) => {
    const result = { status: 'ok', store: store ? 'redis' : 'memory', ts: new Date().toISOString() };
    try {
      const { testConnection } = await import('../backend/src/config/database.js');
      const db = await testConnection();
      result.db = 'connected';
      result.db_ts = db.ts;
    } catch (err) {
      result.db = 'error';
      result.db_error = err.message;
      result.status = 'degraded';
    }
    res.json(result);
  });

  // Global error handler
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  _appReady = true;
  return app;
}

// Vercel calls this handler for every request
export default async function handler(req, res) {
  // /api/ping is registered directly on `app` above — always works.
  // For everything else, call getApp() to finish initialization.
  if (req.url === '/api/ping' || req.url.startsWith('/api/ping?')) {
    return app(req, res);
  }

  try {
    const application = await getApp();
    return application(req, res);
  } catch (err) {
    // Any import or startup failure returns structured JSON instead of
    // Vercel's HTML "This Serverless Function has crashed" page.
    console.error('[handler] startup error:', err.message, '\n', err.stack);
    res.status(500).json({
      error: `Startup error: ${err.message}`,
      hint: 'Check Vercel function logs for the full stack trace.',
      module: err.code === 'ERR_MODULE_NOT_FOUND' ? err.url : undefined,
    });
  }
}
