import express from 'express';
import { query } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all connected channels
router.get('/channels', requireAuth, async (req, res) => {
  try {
    const [wa, slack, gmail, gchat] = await Promise.all([
      query('SELECT id, phone_number, account_type, status, created_at FROM whatsapp_connections WHERE user_id = $1', [req.user.id]),
      query('SELECT id, team_id, team_name, status, channel_count, created_at FROM slack_workspaces WHERE user_id = $1', [req.user.id]),
      query('SELECT id, email, status, created_at FROM gmail_connections WHERE user_id = $1', [req.user.id]),
      query('SELECT id, email, status, created_at FROM google_chat_connections WHERE user_id = $1', [req.user.id])
    ]);

    res.json({
      whatsapp: wa.rows[0] || null,
      slack_workspaces: slack.rows,
      gmail: gmail.rows[0] || null,
      google_chat: gchat.rows[0] || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
