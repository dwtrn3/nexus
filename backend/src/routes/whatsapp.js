import express from 'express';
import { query } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { initWhatsAppPersonal, getQRCode } from '../services/whatsappPersonal.js';

const router = express.Router();

// Get WhatsApp connection status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, phone_number, account_type, status, created_at FROM whatsapp_connections WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ connection: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Connect WhatsApp - check number first
router.post('/check-number', requireAuth, async (req, res) => {
  try {
    const { phone_number } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'Phone number required' });

    const normalized = phone_number.replace(/\D/g, '');
    const existing = await query(
      'SELECT user_id FROM whatsapp_connections WHERE phone_number = $1',
      [normalized]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].user_id === req.user.id) {
        return res.json({ available: true, own: true });
      }
      return res.status(409).json({
        available: false,
        error: 'This number is already linked to another account'
      });
    }

    res.json({ available: true, own: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Connect WhatsApp Business API
router.post('/connect/business', requireAuth, async (req, res) => {
  try {
    const { phone_number, meta_access_token, waba_id, phone_number_id } = req.body;
    if (!phone_number || !meta_access_token) {
      return res.status(400).json({ error: 'Phone number and Meta access token required' });
    }

    const normalized = phone_number.replace(/\D/g, '');

    // Check for duplicate
    const existing = await query(
      'SELECT user_id FROM whatsapp_connections WHERE phone_number = $1',
      [normalized]
    );
    if (existing.rows.length > 0 && existing.rows[0].user_id !== req.user.id) {
      return res.status(409).json({ error: 'This number is already linked to another account' });
    }

    // Check user doesn't already have a connection
    const userConn = await query(
      'SELECT id FROM whatsapp_connections WHERE user_id = $1',
      [req.user.id]
    );
    if (userConn.rows.length > 0) {
      return res.status(409).json({ error: 'You already have a WhatsApp connection. Remove it first.' });
    }

    const credentials = JSON.stringify({
      access_token: meta_access_token,
      waba_id,
      phone_number_id
    });

    await query(
      `INSERT INTO whatsapp_connections (user_id, phone_number, account_type, wa_credentials, status)
       VALUES ($1, $2, 'business_api', $3, 'connected')
       ON CONFLICT (user_id) DO UPDATE SET phone_number=$2, account_type='business_api', wa_credentials=$3, status='connected'`,
      [req.user.id, normalized, credentials]
    );

    res.json({ success: true, account_type: 'business_api', phone_number: normalized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initiate WhatsApp Personal (QR)
router.post('/connect/personal/init', requireAuth, async (req, res) => {
  try {
    const { phone_number } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'Phone number required' });

    const normalized = phone_number.replace(/\D/g, '');

    // Check duplicate
    const existing = await query(
      'SELECT user_id FROM whatsapp_connections WHERE phone_number = $1',
      [normalized]
    );
    if (existing.rows.length > 0 && existing.rows[0].user_id !== req.user.id) {
      return res.status(409).json({ error: 'This number is already linked to another account' });
    }

    // Start Baileys session & get QR
    const sessionId = `wa_${req.user.id}`;
    const qr = await initWhatsAppPersonal(sessionId, req.user.id, normalized);

    res.json({ qr, sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Poll QR status
router.get('/connect/personal/status/:sessionId', requireAuth, async (req, res) => {
  try {
    const qr = await getQRCode(req.params.sessionId);
    const conn = await query(
      'SELECT status FROM whatsapp_connections WHERE user_id = $1',
      [req.user.id]
    );
    res.json({
      qr,
      connected: conn.rows[0]?.status === 'connected',
      status: conn.rows[0]?.status || 'pending'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disconnect
router.delete('/disconnect', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM whatsapp_connections WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook for Meta Cloud API
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

router.post('/webhook', express.json(), async (req, res) => {
  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === 'messages') {
            await processWhatsAppWebhook(change.value);
          }
        }
      }
    }
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function processWhatsAppWebhook(value) {
  const { messages, contacts, metadata } = value;
  if (!messages) return;

  for (const msg of messages) {
    const phoneNumberId = metadata?.phone_number_id;
    // Find connection by phone_number_id stored in credentials
    const connResult = await query(
      `SELECT wc.*, u.id as uid FROM whatsapp_connections wc
       JOIN users u ON u.id = wc.user_id
       WHERE wc.wa_credentials::jsonb->>'phone_number_id' = $1`,
      [phoneNumberId]
    );
    if (!connResult.rows[0]) continue;

    const conn = connResult.rows[0];
    const senderPhone = msg.from;
    const contactName = contacts?.find(c => c.wa_id === senderPhone)?.profile?.name || senderPhone;

    let content = '';
    let contentType = 'text';
    if (msg.type === 'text') {
      content = msg.text?.body || '';
    } else if (msg.type === 'image') {
      contentType = 'image';
      content = msg.image?.id || '';
    } else if (msg.type === 'audio') {
      contentType = 'audio';
      content = msg.audio?.id || '';
    } else if (msg.type === 'video') {
      contentType = 'video';
      content = msg.video?.id || '';
    } else if (msg.type === 'document') {
      contentType = 'file';
      content = msg.document?.id || '';
    }

    const threadId = `wa_${conn.phone_number}_${senderPhone}`;

    await query(
      `INSERT INTO messages (user_id, origin_channel, origin_channel_id, thread_id, sender_name, sender_id, direction, category, content_type, content, metadata)
       VALUES ($1, 'whatsapp', $2, $3, $4, $5, 'inbound', 'client', $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [conn.user_id, conn.phone_number, threadId, contactName, senderPhone, contentType, content, JSON.stringify(msg)]
    );
  }
}

export default router;
