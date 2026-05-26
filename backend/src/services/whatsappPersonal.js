import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { query } from '../config/database.js';
import { io } from '../index.js';
import path from 'path';
import fs from 'fs';

const sessions = new Map();
const qrCodes = new Map();

export async function initWhatsAppPersonal(sessionId, userId, phoneNumber) {
  const sessionPath = path.join(process.cwd(), 'sessions', sessionId);
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  return new Promise(async (resolve, reject) => {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: { level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: console.warn, error: console.error, fatal: console.error, child: () => ({ level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: console.warn, error: console.error, fatal: console.error, child: () => ({}) }) }
      });

      sessions.set(sessionId, sock);

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          const qrDataUrl = await QRCode.toDataURL(qr);
          qrCodes.set(sessionId, qrDataUrl);

          // Emit QR via socket
          if (io) {
            io.emit(`qr_${sessionId}`, { qr: qrDataUrl });
          }

          // Resolve with QR on first generation
          resolve(qrDataUrl);
        }

        if (connection === 'open') {
          qrCodes.delete(sessionId);

          // Save connected status
          await query(
            `INSERT INTO whatsapp_connections (user_id, phone_number, account_type, status, wa_credentials)
             VALUES ($1, $2, 'personal', 'connected', $3)
             ON CONFLICT (user_id) DO UPDATE SET phone_number=$2, account_type='personal', status='connected', wa_credentials=$3`,
            [userId, phoneNumber, JSON.stringify({ session_path: sessionPath })]
          );

          if (io) {
            io.to(`user_${userId}`).emit('whatsapp_connected', { phone_number: phoneNumber });
          }
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error instanceof Boom)
            ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
            : true;

          if (shouldReconnect) {
            setTimeout(() => initWhatsAppPersonal(sessionId, userId, phoneNumber), 3000);
          } else {
            await query(
              'UPDATE whatsapp_connections SET status = $1 WHERE user_id = $2',
              ['disconnected', userId]
            );
          }
        }
      });

      sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
        if (type !== 'notify') return;
        for (const msg of msgs) {
          if (!msg.message || msg.key.fromMe) continue;

          const senderPhone = msg.key.remoteJid?.replace('@s.whatsapp.net', '') || '';
          const content = msg.message?.conversation ||
                          msg.message?.extendedTextMessage?.text ||
                          '';
          const threadId = `wa_${phoneNumber}_${senderPhone}`;

          try {
            await query(
              `INSERT INTO messages (user_id, origin_channel, origin_channel_id, thread_id, sender_name, sender_id, direction, category, content_type, content, metadata)
               VALUES ($1, 'whatsapp', $2, $3, $4, $5, 'inbound', 'client', 'text', $6, $7)`,
              [userId, phoneNumber, threadId, senderPhone, senderPhone, content, JSON.stringify(msg)]
            );

            if (io) {
              io.to(`user_${userId}`).emit('new_message', { thread_id: threadId });
            }
          } catch (err) {
            console.error('Error storing WA message:', err.message);
          }
        }
      });

    } catch (err) {
      reject(err);
    }
  });
}

export function getQRCode(sessionId) {
  return qrCodes.get(sessionId) || null;
}

export async function sendPersonalMessage(userId, toPhone, content) {
  const sessionId = `wa_${userId}`;
  const sock = sessions.get(sessionId);
  if (!sock) throw new Error('WhatsApp personal session not active');
  const jid = toPhone.includes('@') ? toPhone : `${toPhone}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text: content });
}
