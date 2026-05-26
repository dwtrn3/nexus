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
      const setup = await checkSetupStatus(user.id);
      res.json({ user: sanitizeUser(user), ...setup });
    });
  })(req, res, next);
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
