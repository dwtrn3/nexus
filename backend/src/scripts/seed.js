/**
 * Seed demo data for development / testing
 * Usage: node src/scripts/seed.js
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, pool } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

async function seed() {
  console.log('Seeding demo data…');

  // Demo user
  const hash = await bcrypt.hash('password123', 12);
  const userRes = await query(
    `INSERT INTO users (email, name, password_hash)
     VALUES ('demo@nexus.app', 'Demo User', $1)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [hash]
  );
  const userId = userRes.rows[0].id;
  console.log('User:', userId);

  // Fake Slack workspace
  const wsRes = await query(
    `INSERT INTO slack_workspaces (user_id, team_id, team_name, bot_token, user_token, channel_count, status)
     VALUES ($1, 'T_DEMO', 'Acme Corp', 'xoxb-demo', 'xoxp-demo', 12, 'connected')
     ON CONFLICT (user_id, team_id) DO UPDATE SET team_name = EXCLUDED.team_name
     RETURNING id`,
    [userId]
  );
  const wsId = wsRes.rows[0].id;

  // Fake Gmail connection
  await query(
    `INSERT INTO gmail_connections (user_id, email, refresh_token, status)
     VALUES ($1, 'demo@nexus.app', 'fake_refresh_token', 'connected')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  // Fake Google Chat connection
  await query(
    `INSERT INTO google_chat_connections (user_id, email, refresh_token, status)
     VALUES ($1, 'demo@nexus.app', 'fake_refresh_token', 'connected')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  // Fake WhatsApp connection
  await query(
    `INSERT INTO whatsapp_connections (user_id, phone_number, account_type, wa_credentials, status)
     VALUES ($1, '919876543210', 'personal', '{}', 'connected')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  // Demo messages
  const now = new Date();
  const msgs = [
    // WhatsApp thread
    { channel: 'whatsapp', channelId: '919876543210', threadId: 'wa_919876543210_441234567890', sender: 'Alice Johnson', senderId: '441234567890', dir: 'inbound', cat: 'client', content: 'Hi! Can you send me the project proposal?', minsAgo: 15 },
    { channel: 'whatsapp', channelId: '919876543210', threadId: 'wa_919876543210_441234567890', sender: 'Demo User', senderId: userId, dir: 'outbound', cat: 'client', content: 'Sure! I\'ll send it over shortly.', minsAgo: 12 },
    { channel: 'whatsapp', channelId: '919876543210', threadId: 'wa_919876543210_441234567890', sender: 'Alice Johnson', senderId: '441234567890', dir: 'inbound', cat: 'client', content: 'Great, thanks! Also — can we push the deadline to Friday?', minsAgo: 5 },

    // Slack thread in Acme
    { channel: 'slack', channelId: 'C_ACME_GENERAL', wsId, threadId: `slack_T_DEMO_C_ACME_GENERAL_1700000001.000100`, sender: 'Bob Martinez', senderId: 'U_BOB', dir: 'inbound', cat: 'client', content: 'Hey team, sprint review is at 3pm today. Don\'t forget!', minsAgo: 45 },
    { channel: 'slack', channelId: 'C_ACME_GENERAL', wsId, threadId: `slack_T_DEMO_C_ACME_GENERAL_1700000001.000100`, sender: 'Carol White', senderId: 'U_CAROL', dir: 'inbound', cat: 'client', content: 'Will the recording be shared afterwards?', minsAgo: 40 },

    // Another Slack DM
    { channel: 'slack', channelId: 'D_BOB_DM', wsId, threadId: `slack_T_DEMO_D_BOB_DM_1700000002.000200`, sender: 'Bob Martinez', senderId: 'U_BOB', dir: 'inbound', cat: 'client', content: 'Quick question — are you free for a 15 min call tomorrow morning?', minsAgo: 20 },

    // Gmail thread
    { channel: 'gmail', channelId: 'client@bigcorp.com', threadId: 'gmail_thread_001', sender: 'David Chen', senderId: 'david@bigcorp.com', dir: 'inbound', cat: 'client', contentType: 'email', content: 'Re: Q4 Budget Review — Please see my comments inline. We\'d like to reduce the marketing allocation by 15%.', minsAgo: 60 },
    { channel: 'gmail', channelId: 'client@bigcorp.com', threadId: 'gmail_thread_001', sender: 'Demo User', senderId: userId, dir: 'outbound', cat: 'client', contentType: 'email', content: 'Thanks David, I\'ll review and get back to you by EOD.', minsAgo: 50 },

    // Google Chat (internal)
    { channel: 'google_chat', channelId: 'spaces/SPACE_001', threadId: 'gchat_spaces/SPACE_001_msg_001', sender: 'Eve Taylor', senderId: 'eve@company.com', dir: 'inbound', cat: 'internal', content: 'Can someone review my PR before the standup? Link: github.com/acme/app/pull/42', minsAgo: 8 },
    { channel: 'google_chat', channelId: 'spaces/SPACE_001', threadId: 'gchat_spaces/SPACE_001_msg_001', sender: 'Frank Lee', senderId: 'frank@company.com', dir: 'inbound', cat: 'internal', content: 'On it! Looks good so far, leaving a few comments.', minsAgo: 3 },

    // Another Gmail — unread
    { channel: 'gmail', channelId: 'partner@startup.io', threadId: 'gmail_thread_002', sender: 'Grace Kim', senderId: 'grace@startup.io', dir: 'inbound', cat: 'client', contentType: 'email', content: 'Partnership proposal — Hi, we\'d love to explore a co-marketing opportunity with Nexus. Are you open to a call next week?', minsAgo: 2, unread: true },
  ];

  for (const m of msgs) {
    const ts = new Date(now.getTime() - (m.minsAgo || 0) * 60 * 1000);
    const readAt = m.unread ? null : (m.dir === 'inbound' ? ts : null);
    await query(
      `INSERT INTO messages (user_id, origin_channel, origin_channel_id, origin_workspace_id,
         thread_id, sender_name, sender_id, direction, category, content_type, content, created_at, read_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        userId, m.channel, m.channelId, m.wsId || null,
        m.threadId, m.sender, m.senderId, m.dir, m.cat,
        m.contentType || 'text', m.content, ts, readAt
      ]
    );
  }

  console.log(`Seeded ${msgs.length} messages`);
  console.log('\nDemo credentials:\n  Email:    demo@nexus.app\n  Password: password123\n');
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
