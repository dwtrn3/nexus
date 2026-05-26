import express from 'express';
import axios from 'axios';
import { query } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { io } from '../index.js';

const router = express.Router();

// Get inbox messages
router.get('/', requireAuth, async (req, res) => {
  try {
    const { category, unread, limit = 50, offset = 0 } = req.query;

    let whereClause = 'WHERE m.user_id = $1';
    const params = [req.user.id];
    let paramIndex = 2;

    if (category === 'internal') {
      whereClause += ` AND m.category = 'internal'`;
    } else if (category === 'client') {
      whereClause += ` AND m.category = 'client'`;
    }

    if (unread === 'true') {
      whereClause += ` AND m.read_at IS NULL AND m.direction = 'inbound'`;
    }

    const countResult = await query(
      `SELECT COUNT(DISTINCT m.thread_id) FROM messages m ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT DISTINCT ON (m.thread_id)
         m.id, m.thread_id, m.origin_channel, m.origin_channel_id, m.origin_workspace_id,
         m.sender_name, m.sender_id, m.direction, m.category, m.content_type, m.content,
         m.created_at, m.read_at,
         (SELECT COUNT(*) FROM messages WHERE thread_id = m.thread_id AND user_id = m.user_id) as message_count,
         (SELECT COUNT(*) FROM messages WHERE thread_id = m.thread_id AND user_id = m.user_id AND read_at IS NULL AND direction = 'inbound') as unread_count,
         sw.team_name as workspace_name
       FROM messages m
       LEFT JOIN slack_workspaces sw ON sw.id = m.origin_workspace_id
       ${whereClause}
       ORDER BY m.thread_id, m.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      messages: result.rows,
      total: parseInt(countResult.rows[0].count),
      hasMore: parseInt(offset) + result.rows.length < parseInt(countResult.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get thread messages
router.get('/thread/:threadId', requireAuth, async (req, res) => {
  try {
    const threadId = decodeURIComponent(req.params.threadId);

    const result = await query(
      `SELECT m.*, sw.team_name as workspace_name
       FROM messages m
       LEFT JOIN slack_workspaces sw ON sw.id = m.origin_workspace_id
       WHERE m.thread_id = $1 AND m.user_id = $2
       ORDER BY m.created_at ASC`,
      [threadId, req.user.id]
    );

    // Mark as read
    await query(
      `UPDATE messages SET read_at = NOW()
       WHERE thread_id = $1 AND user_id = $2 AND read_at IS NULL AND direction = 'inbound'`,
      [threadId, req.user.id]
    );

    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send reply
router.post('/reply', requireAuth, async (req, res) => {
  try {
    const { thread_id, content, origin_channel, origin_channel_id, origin_workspace_id } = req.body;

    if (!thread_id || !content || !origin_channel) {
      return res.status(400).json({ error: 'thread_id, content, and origin_channel required' });
    }

    // Route reply back through originating channel
    let sent = false;
    let error = null;

    switch (origin_channel) {
      case 'whatsapp':
        ({ sent, error } = await sendWhatsAppReply(req.user.id, origin_channel_id, content));
        break;
      case 'slack':
        ({ sent, error } = await sendSlackReply(req.user.id, origin_workspace_id, origin_channel_id, thread_id, content));
        break;
      case 'gmail':
        ({ sent, error } = await sendGmailReply(req.user.id, origin_channel_id, thread_id, content));
        break;
      case 'google_chat':
        ({ sent, error } = await sendGoogleChatReply(req.user.id, origin_channel_id, content));
        break;
      default:
        return res.status(400).json({ error: 'Unknown channel' });
    }

    if (!sent) {
      return res.status(500).json({ error: error || 'Failed to send message' });
    }

    // Save outbound message
    const msgResult = await query(
      `INSERT INTO messages (user_id, origin_channel, origin_channel_id, origin_workspace_id, thread_id, sender_name, sender_id, direction, category, content_type, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'outbound', $8, 'text', $9) RETURNING *`,
      [
        req.user.id, origin_channel, origin_channel_id, origin_workspace_id || null,
        thread_id, req.user.name, req.user.id,
        origin_channel === 'google_chat' ? 'internal' : 'client',
        content
      ]
    );

    // Emit via socket
    io.to(`user_${req.user.id}`).emit('new_message', msgResult.rows[0]);

    res.json({ success: true, message: msgResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function sendWhatsAppReply(userId, toPhone, content) {
  try {
    const conn = await query(
      'SELECT * FROM whatsapp_connections WHERE user_id = $1',
      [userId]
    );
    if (!conn.rows[0]) return { sent: false, error: 'WhatsApp not connected' };

    const connection = conn.rows[0];
    const creds = JSON.parse(connection.wa_credentials || '{}');

    if (connection.account_type === 'business_api') {
      await axios.post(
        `https://graph.facebook.com/v18.0/${creds.phone_number_id}/messages`,
        {
          messaging_product: 'whatsapp',
          to: toPhone,
          type: 'text',
          text: { body: content }
        },
        { headers: { Authorization: `Bearer ${creds.access_token}` } }
      );
    }
    // Personal WhatsApp via Baileys handled separately
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function sendSlackReply(userId, workspaceId, channelId, threadId, content) {
  try {
    const ws = await query(
      'SELECT * FROM slack_workspaces WHERE id = $1 AND user_id = $2',
      [workspaceId, userId]
    );
    if (!ws.rows[0]) return { sent: false, error: 'Slack workspace not found' };

    const token = ws.rows[0].user_token || ws.rows[0].bot_token;
    // Extract thread_ts from thread_id: slack_teamId_channelId_ts
    const parts = threadId.split('_');
    const thread_ts = parts[parts.length - 1];

    await axios.post('https://slack.com/api/chat.postMessage', {
      channel: channelId,
      text: content,
      thread_ts: thread_ts !== channelId ? thread_ts : undefined
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function sendGmailReply(userId, threadId, fullThreadId, content) {
  try {
    const { google } = await import('googleapis');
    const conn = await query(
      'SELECT * FROM gmail_connections WHERE user_id = $1',
      [userId]
    );
    if (!conn.rows[0]) return { sent: false, error: 'Gmail not connected' };

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: conn.rows[0].refresh_token });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const rawEmail = Buffer.from(
      `To: ${threadId}\r\nContent-Type: text/plain\r\n\r\n${content}`
    ).toString('base64url');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawEmail,
        threadId: fullThreadId.replace('gmail_', '')
      }
    });

    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function sendGoogleChatReply(userId, spaceId, content) {
  return { sent: true }; // Placeholder - Google Chat API integration
}

// Mark thread as read
router.put('/thread/:threadId/read', requireAuth, async (req, res) => {
  try {
    await query(
      `UPDATE messages SET read_at = NOW()
       WHERE thread_id = $1 AND user_id = $2 AND read_at IS NULL`,
      [decodeURIComponent(req.params.threadId), req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get unread counts
router.get('/unread-counts', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE read_at IS NULL AND direction = 'inbound') as total_unread,
         COUNT(*) FILTER (WHERE read_at IS NULL AND direction = 'inbound' AND category = 'internal') as internal_unread,
         COUNT(*) FILTER (WHERE read_at IS NULL AND direction = 'inbound' AND category = 'client') as client_unread
       FROM messages WHERE user_id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
