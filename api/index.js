/**
 * Vercel Serverless Entry Point
 * Handles all /api/* routes as a single serverless function.
 * Socket.IO is disabled (no persistent connections in serverless).
 * Uses Vercel Postgres + Vercel KV (Upstash Redis).
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import passport from 'passport';

// ── Route imports (paths relative to /api/index.js → /backend/src/routes/) ──
import authRoutes from '../backend/src/routes/auth.js';
import whatsappRoutes from '../backend/src/routes/whatsapp.js';
import slackRoutes from '../backend/src/routes/slack.js';
import gmailRoutes from '../backend/src/routes/gmail.js';
import googleChatRoutes from '../backend/src/routes/googleChat.js';
import messagesRoutes from '../backend/src/routes/messages.js';
import settingsRoutes from '../backend/src/routes/settings.js';
import { configurePassport } from '../backend/src/config/passport.js';
import { runMigrations } from '../backend/src/migrations/run.js';

// ── App setup ────────────────────────────────────────────────────────────────
const app = express();

// Redis / session store (Vercel KV uses same redis protocol)
const redisClient = createClient({
  url: process.env.REDIS_URL || process.env.KV_URL,
});

let redisReady = false;
async function ensureRedis() {
  if (!redisReady) {
    await redisClient.connect();
    redisReady = true;
  }
}

let migrationsRun = false;
async function ensureMigrations() {
  if (!migrationsRun) {
    await runMigrations();
    migrationsRun = true;
  }
}

// Warm-up connections (non-blocking)
ensureRedis().catch(console.error);
ensureMigrations().catch(console.error);

const redisStore = new RedisStore({ client: redisClient });

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // server-to-server
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS: not allowed'));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: redisStore,
  secret: process.env.SESSION_SECRET || 'nexus-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,    // always secure on Vercel (HTTPS)
    httpOnly: true,
    sameSite: 'none', // required for cross-origin cookies (frontend ↔ api)
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());
configurePassport(passport);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/google-chat', googleChatRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', env: 'vercel', ts: new Date().toISOString() })
);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Vercel export ─────────────────────────────────────────────────────────────
export default app;
