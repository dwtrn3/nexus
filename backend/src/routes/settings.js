import express from 'express';
import { query } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all connected channels with status
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

// Reconnect a channel (set status back to connected)
router.post('/reconnect/:channel', requireAuth, async (req, res) => {
  const { channel } = req.params;
  const userId = req.user.id;

  try {
    switch (channel) {
      case 'whatsapp':
        await query(
          `UPDATE whatsapp_connections SET status = 'connected' WHERE user_id = $1`,
          [userId]
        );
        break;
      case 'gmail':
        await query(
          `UPDATE gmail_connections SET status = 'connected' WHERE user_id = $1`,
          [userId]
        );
        break;
      case 'google_chat':
        await query(
          `UPDATE google_chat_connections SET status = 'connected' WHERE user_id = $1`,
          [userId]
        );
        break;
      case 'slack':
        // For Slack, mark all workspaces as connected
        await query(
          `UPDATE slack_workspaces SET status = 'connected' WHERE user_id = $1`,
          [userId]
        );
        break;
      default:
        return res.status(400).json({ error: 'Unknown channel' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get message stats per channel
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT
         origin_channel,
         COUNT(*) as total_messages,
         COUNT(*) FILTER (WHERE read_at IS NULL AND direction = 'inbound') as unread_messages,
         MAX(created_at) as last_message_at
       FROM messages
       WHERE user_id = $1
       GROUP BY origin_channel`,
      [req.user.id]
    );

    const stats = {};
    for (const row of result.rows) {
      stats[row.origin_channel] = {
        total: parseInt(row.total_messages),
        unread: parseInt(row.unread_messages),
        lastMessageAt: row.last_message_at
      };
    }

    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
