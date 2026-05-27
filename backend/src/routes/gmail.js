import express from 'express';
import { query } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

// Lazy-load googleapis — it's ~150 MB unzipped and causes OOM on cold start
// if imported eagerly in a serverless function.
let _google = null;
async function getGoogle() {
  if (!_google) ({ google: _google } = await import('googleapis'));
  return _google;
}

const router = express.Router();

async function getOAuth2Client() {
  const google = await getGoogle();
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || 'http://localhost:3001/api/gmail/oauth/callback'
  );
}

// Get Gmail connection
router.get('/status', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, status, created_at FROM gmail_connections WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ connection: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initiate Gmail OAuth
router.get('/oauth/initiate', requireAuth, async (req, res) => {
  try {
    const oauth2Client = await getOAuth2Client();
    const state = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64');

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
      state
    });

    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gmail OAuth callback
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL}/setup?gmail_error=${error}`);
    }

    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const userId = stateData.userId;

    const google = await getGoogle();
    const oauth2Client = await getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    await query(
      `INSERT INTO gmail_connections (user_id, email, refresh_token, status)
       VALUES ($1, $2, $3, 'connected')
       ON CONFLICT (user_id) DO UPDATE SET email=$2, refresh_token=$3, status='connected'`,
      [userId, email, tokens.refresh_token || tokens.access_token]
    );

    // Set up Gmail push notifications via Pub/Sub (if configured)
    if (process.env.GMAIL_PUBSUB_TOPIC) {
      try {
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        await gmail.users.watch({
          userId: 'me',
          requestBody: {
            topicName: process.env.GMAIL_PUBSUB_TOPIC,
            labelIds: ['INBOX']
          }
        });
      } catch (watchErr) {
        console.warn('Gmail watch setup failed:', watchErr.message);
      }
    }

    res.redirect(`${process.env.FRONTEND_URL}/setup?gmail_success=1`);
  } catch (err) {
    console.error('Gmail OAuth error:', err);
    res.redirect(`${process.env.FRONTEND_URL}/setup?gmail_error=unknown`);
  }
});

// Fetch recent Gmail messages
router.get('/messages', requireAuth, async (req, res) => {
  try {
    const connResult = await query(
      'SELECT * FROM gmail_connections WHERE user_id = $1',
      [req.user.id]
    );
    if (!connResult.rows[0]) {
      return res.status(404).json({ error: 'Gmail not connected' });
    }

    const google = await getGoogle();
    const conn = connResult.rows[0];
    const oauth2Client = await getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: conn.refresh_token });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50,
      q: 'in:inbox'
    });

    const messages = [];
    for (const msg of (listRes.data.messages || []).slice(0, 20)) {
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date']
      });
      messages.push(fullMsg.data);
    }

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook for Gmail Pub/Sub
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const { message } = req.body;
    if (message) {
      const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
      await processGmailNotification(data);
    }
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function processGmailNotification(data) {
  const { emailAddress, historyId } = data;
  try {
    const connResult = await query(
      'SELECT * FROM gmail_connections WHERE email = $1',
      [emailAddress]
    );
    if (!connResult.rows[0]) return;

    const google = await getGoogle();
    const conn = connResult.rows[0];
    const oauth2Client = await getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: conn.refresh_token });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const historyRes = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: historyId,
      historyTypes: ['messageAdded']
    });

    for (const record of (historyRes.data.history || [])) {
      for (const added of (record.messagesAdded || [])) {
        const msgId = added.message.id;
        const fullMsg = await gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date']
        });

        const headers = fullMsg.data.payload?.headers || [];
        const from = headers.find(h => h.name === 'From')?.value || '';
        const subject = headers.find(h => h.name === 'Subject')?.value || '(No subject)';
        const fromName = from.replace(/<.*>/, '').trim() || from;
        const threadId = `gmail_${fullMsg.data.threadId}`;

        await query(
          `INSERT INTO messages (user_id, origin_channel, origin_channel_id, thread_id, sender_name, sender_id, direction, category, content_type, content, metadata)
           VALUES ($1, 'gmail', $2, $3, $4, $5, 'inbound', 'client', 'email', $6, $7)
           ON CONFLICT DO NOTHING`,
          [conn.user_id, fullMsg.data.threadId, threadId, fromName, from, subject, JSON.stringify(fullMsg.data)]
        );
      }
    }
  } catch (err) {
    console.error('Gmail notification processing error:', err.message);
  }
}

// Disconnect
router.delete('/disconnect', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM gmail_connections WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
