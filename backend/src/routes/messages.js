import express from 'express';
import axios from 'axios';
import { query } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { io } from '../socket/io-singleton.js';
import { google } from 'googleapis';

const router = express.Router();

// Get inbox — one row per thread, sorted by latest message desc
router.get('/', requireAuth, async (req, res) => {
  try {
    const { category, unread, limit = 50, offset = 0 } = req.query;

    const conditions = ['m.user_id = $1'];
    const params = [req.user.id];

    if (category === 'internal') conditions.push(`m.category = 'internal'`);
    else if (category === 'client') conditions.push(`m.category = 'client'`);
    if (unread === 'true') conditions.push(`m.read_at IS NULL AND m.direction = 'inbound'`);

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // Count distinct threads
    const countResult = await query(
      `SELECT COUNT(*) FROM (
         SELECT DISTINCT m.thread_id FROM messages m ${whereClause}
       ) t`,
      params
    );

    // Latest message per thread, ordered by that latest time
    const result = await query(
      `SELECT latest.*, sw.team_name as workspace_name,
         (SELECT COUNT(*) FROM messages WHERE thread_id = latest.thread_id AND user_id = latest.user_id) as message_count,
         (SELECT COUNT(*) FROM messages WHERE thread_id = latest.thread_id AND user_id = latest.user_id AND read_at IS NULL AND direction = 'inbound') as unread_count
       FROM (
         SELECT DISTINCT ON (m.thread_id)
           m.id, m.thread_id, m.origin_channel, m.origin_channel_id, m.origin_workspace_id,
           m.sender_name, m.sender_id, m.direction, m.category, m.content_type, m.content,
           m.created_at, m.read_at, m.user_id
         FROM messages m
         ${whereClause}
         ORDER BY m.thread_id, m.created_at DESC
       ) latest
       LEFT JOIN slack_workspaces sw ON sw.id = latest.origin_workspace_id
       ORDER BY latest.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      messages: result.rows,
      total: parseInt(countResult.rows[0].count),
      hasMore: parseInt(offset) + result.rows.length < parseInt(countResult.rows[0].count)
    });
  } catch (err) {
    console.error('Inbox error:', err);
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

    // Mark inbound messages as read
    await query(
      `UPDATE messages SET read_at = NOW()
       WHERE thread_id = $1 AND user_id = $2 AND read_at IS NULL AND direction = 'inbound'`,
      [threadId, req.user.id]
    );

    // Emit read event so inbox updates
    io.to(`user_${req.user.id}`).emit('thread_read', { thread_id: threadId });

    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send reply — always routes back through originating channel
router.post('/reply', requireAuth, async (req, res) => {
  try {
    const { thread_id, content, origin_channel, origin_channel_id, origin_workspace_id } = req.body;

    if (!thread_id || !content || !origin_channel) {
      return res.status(400).json({ error: 'thread_id, content, and origin_channel required' });
    }

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

    const category = origin_channel === 'google_chat' ? 'internal' : 'client';

    const msgResult = await query(
      `INSERT INTO messages (user_id, origin_channel, origin_channel_id, origin_workspace_id,
         thread_id, sender_name, sender_id, direction, category, content_type, content)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'outbound',$8,'text',$9) RETURNING *`,
      [req.user.id, origin_channel, origin_channel_id, origin_workspace_id || null,
       thread_id, req.user.name, req.user.id, category, content]
    );

    io.to(`user_${req.user.id}`).emit('new_message', msgResult.rows[0]);
    res.json({ success: true, message: msgResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search messages
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { q, limit = 30 } = req.query;
    if (!q || q.trim().length < 2) return res.json({ messages: [] });

    const result = await query(
      `SELECT DISTINCT ON (m.thread_id)
         m.id, m.thread_id, m.origin_channel, m.origin_channel_id, m.origin_workspace_id,
         m.sender_name, m.direction, m.category, m.content_type, m.content, m.created_at, m.read_at,
         sw.team_name as workspace_name
       FROM messages m
       LEFT JOIN slack_workspaces sw ON sw.id = m.origin_workspace_id
       WHERE m.user_id = $1
         AND (m.content ILIKE $2 OR m.sender_name ILIKE $2)
       ORDER BY m.thread_id, m.created_at DESC
       LIMIT $3`,
      [req.user.id, `%${q.trim()}%`, parseInt(limit)]
    );

    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// Unread counts — count distinct threads with unread messages
router.get('/unread-counts', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT
         COUNT(DISTINCT thread_id) FILTER (WHERE read_at IS NULL AND direction = 'inbound') as total_unread,
         COUNT(DISTINCT thread_id) FILTER (WHERE read_at IS NULL AND direction = 'inbound' AND category = 'internal') as internal_unread,
         COUNT(DISTINCT thread_id) FILTER (WHERE read_at IS NULL AND direction = 'inbound' AND category = 'client') as client_unread
       FROM messages WHERE user_id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Channel send helpers ──────────────────────────────────────────────────────

async function sendWhatsAppReply(userId, toPhone, content) {
  try {
    const conn = await query('SELECT * FROM whatsapp_connections WHERE user_id = $1', [userId]);
    if (!conn.rows[0]) return { sent: false, error: 'WhatsApp not connected' };

    const connection = conn.rows[0];
    const creds = JSON.parse(connection.wa_credentials || '{}');

    if (connection.account_type === 'business_api') {
      const res = await axios.post(
        `https://graph.facebook.com/v18.0/${creds.phone_number_id}/messages`,
        { messaging_product: 'whatsapp', to: toPhone, type: 'text', text: { body: content } },
        { headers: { Authorization: `Bearer ${creds.access_token}` } }
      );
      if (!res.data?.messages) return { sent: false, error: 'Meta API error' };
    } else {
      // Personal via Baileys — import service dynamically to avoid circular dep
      const { sendPersonalMessage } = await import('../services/whatsappPersonal.js');
      await sendPersonalMessage(userId, toPhone, content);
    }
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
    // thread_id format: slack_TEAMID_CHANNELID_THREADTS
    const parts = threadId.split('_');
    const thread_ts = parts.length >= 4 ? parts.slice(3).join('_') : undefined;

    const body = { channel: channelId, text: content };
    if (thread_ts && thread_ts !== channelId) body.thread_ts = thread_ts;

    const res = await axios.post('https://slack.com/api/chat.postMessage', body, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });

    if (!res.data?.ok) return { sent: false, error: res.data?.error || 'Slack error' };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function sendGmailReply(userId, toAddress, fullThreadId, content) {
  try {
    const conn = await query('SELECT * FROM gmail_connections WHERE user_id = $1', [userId]);
    if (!conn.rows[0]) return { sent: false, error: 'Gmail not connected' };

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: conn.rows[0].refresh_token });

    const gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
    const gmailThreadId = fullThreadId.replace(/^gmail_/, '');

    // Fetch thread to get Subject and In-Reply-To
    let subject = 'Re: (no subject)';
    let inReplyTo = '';
    try {
      const thread = await gmailClient.users.threads.get({ userId: 'me', id: gmailThreadId, format: 'metadata', metadataHeaders: ['Subject', 'Message-ID'] });
      const msgs = thread.data.messages || [];
      const last = msgs[msgs.length - 1];
      const headers = last?.payload?.headers || [];
      subject = headers.find(h => h.name === 'Subject')?.value || subject;
      inReplyTo = headers.find(h => h.name === 'Message-ID')?.value || '';
    } catch {}

    const rawLines = [
      `To: ${toAddress}`,
      `Subject: ${subject.startsWith('Re:') ? subject : 'Re: ' + subject}`,
      inReplyTo ? `In-Reply-To: ${inReplyTo}` : '',
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      content
    ].filter(l => l !== null);

    const raw = Buffer.from(rawLines.join('\r\n')).toString('base64url');
    await gmailClient.users.messages.send({
      userId: 'me',
      requestBody: { raw, threadId: gmailThreadId }
    });

    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function sendGoogleChatReply(userId, spaceId, content) {
  try {
    const conn = await query('SELECT * FROM google_chat_connections WHERE user_id = $1', [userId]);
    if (!conn.rows[0]) return { sent: false, error: 'Google Chat not connected' };

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: conn.rows[0].refresh_token });

    const chat = google.chat({ version: 'v1', auth: oauth2Client });
    await chat.spaces.messages.create({
      parent: spaceId,
      requestBody: { text: content }
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

export default router;
