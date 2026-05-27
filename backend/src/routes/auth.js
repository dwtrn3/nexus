import express from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password and name are required' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [email.toLowerCase(), name, hash]
    );

    const user = result.rows[0];
    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'Login failed after registration' });
      res.json({ user: sanitizeUser(user), setupComplete: false });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: info?.message || 'Invalid credentials' });
    req.login(user, async (loginErr) => {
      if (loginErr) return next(loginErr);
      try {
        const setup = await checkSetupStatus(user.id);
        res.json({ user: sanitizeUser(user), ...setup });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
  })(req, res, next);
});

// Demo login — creates the demo account if it doesn't exist, then logs in
router.post('/demo', async (req, res, _next) => {
  const DEMO_EMAIL = 'demo@nexus.app';
  const DEMO_PASS  = 'Demo1234!';
  const DEMO_NAME  = 'Demo User';

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ error: 'Database not configured. Set DATABASE_URL in Vercel environment variables.' });
    }

    let result = await query('SELECT * FROM users WHERE email = $1', [DEMO_EMAIL]);
    let user = result.rows[0];

    if (!user) {
      const hash = await bcrypt.hash(DEMO_PASS, 12);
      const newUser = await query(
        'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *',
        [DEMO_EMAIL, DEMO_NAME, hash]
      );
      user = newUser.rows[0];

      // Seed demo channel connections so inbox isn't empty
      await query(
        `INSERT INTO google_chat_connections (user_id, email, status)
         VALUES ($1, $2, 'connected') ON CONFLICT (user_id) DO NOTHING`,
        [user.id, DEMO_EMAIL]
      );
      const ws = await query(
        `INSERT INTO slack_workspaces (user_id, team_id, team_name, bot_token, user_token, channel_count, status)
         VALUES ($1, 'T_DEMO', 'Acme Corp', 'xoxb-demo', 'xoxp-demo', 12, 'connected')
         ON CONFLICT (user_id, team_id) DO UPDATE SET team_name=EXCLUDED.team_name RETURNING id`,
        [user.id]
      );
      const wsId = ws.rows[0].id;

      await query(
        `INSERT INTO gmail_connections (user_id, email, status)
         VALUES ($1, $2, 'connected') ON CONFLICT (user_id) DO NOTHING`,
        [user.id, DEMO_EMAIL]
      );

      // Demo messages across all channels
      const now = new Date();
      const msgs = [
        { ch: 'whatsapp', chId: '919876543210', wsId: null,  tid: 'wa_919876543210_441234567890', sender: 'Alice Johnson', sid: '441234567890', dir: 'inbound',  cat: 'client',   ct: 'text',  body: 'Hi! Can you send me the project proposal?', ago: 15 },
        { ch: 'whatsapp', chId: '919876543210', wsId: null,  tid: 'wa_919876543210_441234567890', sender: DEMO_NAME,     sid: user.id,       dir: 'outbound', cat: 'client',   ct: 'text',  body: "Sure, I'll send it over shortly.",              ago: 12 },
        { ch: 'whatsapp', chId: '919876543210', wsId: null,  tid: 'wa_919876543210_441234567890', sender: 'Alice Johnson', sid: '441234567890', dir: 'inbound',  cat: 'client',   ct: 'text',  body: 'Great! Also — can we push the deadline to Friday?', ago: 5, unread: true },
        { ch: 'slack',    chId: 'C_GENERAL',    wsId,        tid: `slack_T_DEMO_C_GENERAL_1700000001`, sender: 'Bob Martinez', sid: 'U_BOB', dir: 'inbound',  cat: 'client',   ct: 'text',  body: "Sprint review at 3 pm today — don't forget!",   ago: 45 },
        { ch: 'slack',    chId: 'C_GENERAL',    wsId,        tid: `slack_T_DEMO_C_GENERAL_1700000001`, sender: 'Carol White',  sid: 'U_CAROL', dir: 'inbound', cat: 'client',   ct: 'text',  body: 'Will the recording be shared afterwards?',       ago: 40 },
        { ch: 'slack',    chId: 'D_BOB_DM',     wsId,        tid: `slack_T_DEMO_D_BOB_DM_1700000002`,  sender: 'Bob Martinez', sid: 'U_BOB', dir: 'inbound',  cat: 'client',   ct: 'text',  body: 'Free for a 15-min call tomorrow morning?',      ago: 20, unread: true },
        { ch: 'gmail',    chId: 'david@bigcorp.com', wsId: null, tid: 'gmail_thread_001', sender: 'David Chen', sid: 'david@bigcorp.com', dir: 'inbound', cat: 'client', ct: 'email', body: "Re: Q4 Budget — We'd like to reduce marketing allocation by 15%.", ago: 60 },
        { ch: 'gmail',    chId: 'david@bigcorp.com', wsId: null, tid: 'gmail_thread_001', sender: DEMO_NAME, sid: user.id, dir: 'outbound', cat: 'client', ct: 'email', body: "Thanks David, I'll review and get back to you by EOD.", ago: 50 },
        { ch: 'gmail',    chId: 'grace@startup.io',  wsId: null, tid: 'gmail_thread_002', sender: 'Grace Kim', sid: 'grace@startup.io', dir: 'inbound', cat: 'client', ct: 'email', body: 'Partnership proposal — Would love to explore a co-marketing opportunity!', ago: 2, unread: true },
        { ch: 'google_chat', chId: 'spaces/SPACE_001', wsId: null, tid: 'gchat_spaces/SPACE_001_001', sender: 'Eve Taylor', sid: 'eve@company.com', dir: 'inbound', cat: 'internal', ct: 'text', body: 'Can someone review my PR before standup? github.com/acme/app/pull/42', ago: 8, unread: true },
        { ch: 'google_chat', chId: 'spaces/SPACE_001', wsId: null, tid: 'gchat_spaces/SPACE_001_001', sender: 'Frank Lee', sid: 'frank@company.com', dir: 'inbound', cat: 'internal', ct: 'text', body: 'On it! Looks great so far.', ago: 3, unread: true },
      ];

      for (const m of msgs) {
        const ts = new Date(now.getTime() - m.ago * 60 * 1000);
        await query(
          `INSERT INTO messages (user_id,origin_channel,origin_channel_id,origin_workspace_id,thread_id,sender_name,sender_id,direction,category,content_type,content,created_at,read_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [user.id, m.ch, m.chId, m.wsId || null, m.tid, m.sender, m.sid,
           m.dir, m.cat, m.ct, m.body, ts,
           m.unread ? null : (m.dir === 'inbound' ? ts : null)]
        );
      }
    }

    req.login(user, async (loginErr) => {
      if (loginErr) {
        console.error('[demo] req.login error:', loginErr.message);
        return res.status(500).json({ error: loginErr.message });
      }
      try {
        const setup = await checkSetupStatus(user.id);
        res.json({ user: sanitizeUser(user), ...setup });
      } catch (e) {
        console.error('[demo] checkSetupStatus error:', e.message);
        res.status(500).json({ error: e.message });
      }
    });
  } catch (err) {
    console.error('[demo] error:', err.message, err.code || '');
    res.status(500).json({ error: err.message });
  }
});

// Google OAuth
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email',
    'https://www.googleapis.com/auth/chat.messages',
    'https://www.googleapis.com/auth/gmail.modify'],
  accessType: 'offline',
  prompt: 'consent'
}));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=google_failed' }),
  async (req, res) => {
    const setup = await checkSetupStatus(req.user.id);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    if (!setup.setupComplete) {
      res.redirect(`${frontendUrl}/setup`);
    } else {
      res.redirect(`${frontendUrl}/inbox`);
    }
  }
);

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    req.session.destroy();
    res.json({ success: true });
  });
});

// Current user
router.get('/me', requireAuth, async (req, res) => {
  const setup = await checkSetupStatus(req.user.id);
  res.json({ user: sanitizeUser(req.user), ...setup });
});

async function checkSetupStatus(userId) {
  const [wa, slack, gmail] = await Promise.all([
    query('SELECT id FROM whatsapp_connections WHERE user_id = $1', [userId]),
    query('SELECT id FROM slack_workspaces WHERE user_id = $1', [userId]),
    query('SELECT id FROM gmail_connections WHERE user_id = $1', [userId])
  ]);
  const setupComplete = wa.rows.length > 0 || slack.rows.length > 0 || gmail.rows.length > 0;
  return {
    setupComplete,
    connectedChannels: {
      whatsapp: wa.rows.length > 0,
      slack: slack.rows.length > 0,
      gmail: gmail.rows.length > 0
    }
  };
}

function sanitizeUser(user) {
  const { password_hash, google_oauth_token, ...safe } = user;
  return safe;
}

export default router;
