/**
 * Vercel Serverless Entry Point
 *
 * Absolutely zero top-level static imports — everything is loaded
 * dynamically inside the handler so any load failure surfaces as a
 * JSON error instead of Vercel's "Function has crashed" HTML page.
 */

let _app = null;

async function buildApp() {
  if (_app) return _app;

  // ── Core middleware (tiny, essential packages) ──────────────────────────
  const { default: express }  = await import('express');
  const { default: cors }     = await import('cors');
  const { default: helmet }   = await import('helmet');
  const { default: session }  = await import('express-session');
  const { default: passport } = await import('passport');

  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Session store: Redis if available, memory otherwise ─────────────────
  let store;
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
  if (redisUrl) {
    try {
      const { createClient } = await import('redis');
      const { RedisStore }   = await import('connect-redis');
      const client = createClient({ url: redisUrl });
      await client.connect();
      store = new RedisStore({ client });
      console.log('[nexus] session store: redis');
    } catch (e) {
      console.warn('[nexus] redis unavailable, using memory store:', e.message);
    }
  }

  app.use(session({
    store,
    secret: process.env.SESSION_SECRET || 'nexus-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // ── Passport strategies ─────────────────────────────────────────────────
  const { configurePassport } = await import('../backend/src/config/passport.js');
  configurePassport(passport);

  // ── Migrations (best-effort; failure is non-fatal) ──────────────────────
  try {
    const { runMigrations } = await import('../backend/src/migrations/run.js');
    await runMigrations();
  } catch (e) {
    console.warn('[nexus] migration warning:', e.message);
  }

  // ── Routes ──────────────────────────────────────────────────────────────
  const [
    { default: authRoutes },
    { default: whatsappRoutes },
    { default: slackRoutes },
    { default: gmailRoutes },
    { default: googleChatRoutes },
    { default: messagesRoutes },
    { default: settingsRoutes },
  ] = await Promise.all([
    import('../backend/src/routes/auth.js'),
    import('../backend/src/routes/whatsapp.js'),
    import('../backend/src/routes/slack.js'),
    import('../backend/src/routes/gmail.js'),
    import('../backend/src/routes/googleChat.js'),
    import('../backend/src/routes/messages.js'),
    import('../backend/src/routes/settings.js'),
  ]);

  app.use('/api/auth',        authRoutes);
  app.use('/api/whatsapp',    whatsappRoutes);
  app.use('/api/slack',       slackRoutes);
  app.use('/api/gmail',       gmailRoutes);
  app.use('/api/google-chat', googleChatRoutes);
  app.use('/api/messages',    messagesRoutes);
  app.use('/api/settings',    settingsRoutes);

  // ── Health / ping ───────────────────────────────────────────────────────
  app.get('/api/ping', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  app.get('/api/health', async (_req, res) => {
    const result = { status: 'ok', store: store ? 'redis' : 'memory', ts: new Date().toISOString() };
    try {
      const { testConnection } = await import('../backend/src/config/database.js');
      const db = await testConnection();
      result.db = 'connected';
      result.db_ts = db.ts;
    } catch (e) {
      result.db = 'error';
      result.db_error = e.message;
      result.status = 'degraded';
    }
    res.json(result);
  });

  // ── Error handler ───────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[nexus] express error:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  _app = app;
  return app;
}

/**
 * Vercel invokes this for every /api/* request.
 * All errors — including import failures — are returned as JSON.
 */
export default async function handler(req, res) {
  // Fast-path: answer /api/ping without loading anything (no imports needed)
  if (req.url === '/api/ping' || req.url.startsWith('/api/ping?')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
  }

  try {
    const app = await buildApp();
    return app(req, res);
  } catch (err) {
    console.error('[nexus] startup error:', err.message, err.stack);

    // Always return JSON — even if express hasn't loaded yet
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 500;
    res.end(JSON.stringify({
      error: 'Startup error: ' + err.message,
      code:  err.code,           // ERR_MODULE_NOT_FOUND etc.
      module: err.url || null,   // exact missing module path
      hint: 'Check Vercel function logs for full stack trace.',
    }));
  }
}
