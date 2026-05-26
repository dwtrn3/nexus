import express from 'express';
import { query } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/status', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, status, created_at FROM google_chat_connections WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ connection: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook for Google Chat events
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const event = req.body;
    if (event.type === 'MESSAGE') {
      const { message, space } = event;
      const senderName = message.sender?.displayName || 'Unknown';
      const senderId = message.sender?.name || '';
      const content = message.text || '';
      const spaceId = space?.name || '';
      const threadId = `gchat_${spaceId}_${message.thread?.name || message.name}`;

      // Find user by space membership (simplified: route to space owner)
      const connResult = await query(
        'SELECT user_id FROM google_chat_connections LIMIT 1'
      );
      if (!connResult.rows[0]) {
        return res.json({});
      }

      await query(
        `INSERT INTO messages (user_id, origin_channel, origin_channel_id, thread_id, sender_name, sender_id, direction, category, content_type, content, metadata)
         VALUES ($1, 'google_chat', $2, $3, $4, $5, 'inbound', 'internal', 'text', $6, $7)
         ON CONFLICT DO NOTHING`,
        [connResult.rows[0].user_id, spaceId, threadId, senderName, senderId, content, JSON.stringify(event)]
      );
    }
    res.json({});
  } catch (err) {
    console.error('Google Chat webhook error:', err);
    res.status(200).json({});
  }
});

export default router;
