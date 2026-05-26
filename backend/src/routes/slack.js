import express from 'express';
import axios from 'axios';
import { query } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Get Slack workspaces
router.get('/workspaces', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, team_id, team_name, status, created_at FROM slack_workspaces WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ workspaces: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initiate Slack OAuth
router.get('/oauth/initiate', requireAuth, (req, res) => {
  const state = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64');
  const scopes = 'channels:read,channels:history,chat:write,users:read,groups:read,im:read,im:history,mpim:read,mpim:history';
  const userScopes = 'channels:history,chat:write,groups:history,im:history,mpim:history,channels:read,groups:read,im:read,mpim:read';

  const url = `https://slack.com/oauth/v2/authorize?client_id=${process.env.SLACK_CLIENT_ID}&scope=${scopes}&user_scope=${userScopes}&state=${state}&redirect_uri=${encodeURIComponent(process.env.SLACK_REDIRECT_URI || 'http://localhost:3001/api/slack/oauth/callback')}`;
  res.json({ url });
});

// Slack OAuth callback
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL}/setup?slack_error=${error}`);
    }

    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const userId = stateData.userId;

    // Exchange code for token
    const tokenRes = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: process.env.SLACK_REDIRECT_URI || 'http://localhost:3001/api/slack/oauth/callback'
      }
    });

    const data = tokenRes.data;
    if (!data.ok) {
      return res.redirect(`${process.env.FRONTEND_URL}/setup?slack_error=${data.error}`);
    }

    const botToken = data.access_token;
    const userToken = data.authed_user?.access_token;
    const teamId = data.team?.id;
    const teamName = data.team?.name;

    // Save workspace
    await query(
      `INSERT INTO slack_workspaces (user_id, team_id, team_name, bot_token, user_token, status)
       VALUES ($1, $2, $3, $4, $5, 'connected')
       ON CONFLICT (user_id, team_id) DO UPDATE SET team_name=$3, bot_token=$4, user_token=$5, status='connected'`,
      [userId, teamId, teamName, botToken, userToken || '']
    );

    // Enumerate channels
    await importSlackChannels(userId, teamId, botToken, userToken || botToken);

    res.redirect(`${process.env.FRONTEND_URL}/setup?slack_success=1&team=${encodeURIComponent(teamName)}`);
  } catch (err) {
    console.error('Slack OAuth error:', err);
    res.redirect(`${process.env.FRONTEND_URL}/setup?slack_error=unknown`);
  }
});

async function importSlackChannels(userId, teamId, botToken, userToken) {
  try {
    // Get workspace record
    const wsResult = await query(
      'SELECT id FROM slack_workspaces WHERE user_id = $1 AND team_id = $2',
      [userId, teamId]
    );
    const workspaceId = wsResult.rows[0]?.id;

    // List all conversations
    let cursor = '';
    let allChannels = [];

    do {
      const params = {
        types: 'public_channel,private_channel,im,mpim',
        limit: 200,
        exclude_archived: true
      };
      if (cursor) params.cursor = cursor;

      const res = await axios.get('https://slack.com/api/users.conversations', {
        headers: { Authorization: `Bearer ${userToken}` },
        params
      });

      if (!res.data.ok) break;
      allChannels = allChannels.concat(res.data.channels || []);
      cursor = res.data.response_metadata?.next_cursor || '';
    } while (cursor);

    // Update workspace with channel count
    await query(
      'UPDATE slack_workspaces SET channel_count = $1 WHERE id = $2',
      [allChannels.length, workspaceId]
    );

    // Save channels to messages as metadata for now
    // In production would store in slack_channels table
    console.log(`Imported ${allChannels.length} channels for workspace ${teamId}`);
  } catch (err) {
    console.error('Error importing Slack channels:', err.message);
  }
}

// Slack Events webhook
router.post('/events', express.json(), async (req, res) => {
  const { type, challenge, event, team_id } = req.body;

  // URL verification
  if (type === 'url_verification') {
    return res.json({ challenge });
  }

  if (type === 'event_callback' && event) {
    res.status(200).json({ ok: true }); // Respond quickly

    if (event.type === 'message' && !event.subtype) {
      await processSlackMessage(team_id, event);
    }
  } else {
    res.status(200).json({ ok: true });
  }
});

async function processSlackMessage(teamId, event) {
  try {
    const wsResult = await query(
      'SELECT * FROM slack_workspaces WHERE team_id = $1',
      [teamId]
    );
    if (!wsResult.rows[0]) return;

    const workspace = wsResult.rows[0];
    const token = workspace.user_token || workspace.bot_token;

    // Get user info
    let senderName = event.user || 'Unknown';
    try {
      const userRes = await axios.get('https://slack.com/api/users.info', {
        headers: { Authorization: `Bearer ${token}` },
        params: { user: event.user }
      });
      if (userRes.data.ok) {
        senderName = userRes.data.user?.real_name || userRes.data.user?.name || senderName;
      }
    } catch {}

    const threadId = `slack_${teamId}_${event.channel}_${event.thread_ts || event.ts}`;

    await query(
      `INSERT INTO messages (user_id, origin_channel, origin_channel_id, origin_workspace_id, thread_id, sender_name, sender_id, direction, category, content_type, content, metadata)
       VALUES ($1, 'slack', $2, $3, $4, $5, $6, 'inbound', 'client', 'text', $7, $8)
       ON CONFLICT DO NOTHING`,
      [workspace.user_id, event.channel, workspace.id, threadId, senderName, event.user, event.text || '', JSON.stringify(event)]
    );
  } catch (err) {
    console.error('Error processing Slack message:', err.message);
  }
}

// Disconnect workspace
router.delete('/workspaces/:workspaceId', requireAuth, async (req, res) => {
  try {
    await query(
      'DELETE FROM slack_workspaces WHERE id = $1 AND user_id = $2',
      [req.params.workspaceId, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
