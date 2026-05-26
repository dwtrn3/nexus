# Nexus — Unified Communications

A unified inbox that brings **Google Chat**, **WhatsApp**, **Slack**, and **Gmail** into one interface.

```
Internal comms  →  Google Chat (auto-connected on Google sign-in)
Client comms    →  WhatsApp Business API / Personal · Slack (multi-workspace) · Gmail
```

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | PostgreSQL 16 |
| Cache / Sessions | Redis 7 |
| Real-time | Socket.IO |
| Containers | Docker Compose |

---

## Quick Start (Docker)

```bash
# 1. Clone and enter
git clone <repo> && cd nexus

# 2. Configure credentials
cp backend/.env.example backend/.env
# Edit backend/.env with your OAuth keys

# 3. Start everything
docker compose up -d

# 4. Open
open http://localhost:5173
```

---

## Local Dev (without Docker)

**Prerequisites:** Node 20+, PostgreSQL 16, Redis 7

```bash
# Start Postgres + Redis via Docker
docker compose up postgres redis -d

# Backend
cd backend && npm install && npm run dev   # :3001

# Frontend (new terminal)
cd frontend && npm install && npm run dev  # :5173 → proxies /api to :3001
```

---

## Environment Variables (`backend/.env`)

| Variable | Where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | [api.slack.com/apps](https://api.slack.com/apps) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Any string you choose |
| `META_APP_ID` / `META_APP_SECRET` | [developers.facebook.com](https://developers.facebook.com/apps) |

### Google Cloud OAuth scopes required
`profile` · `email` · `https://www.googleapis.com/auth/chat.messages` · `https://www.googleapis.com/auth/gmail.modify`

### Slack app settings
- **Bot scopes:** `channels:read channels:history chat:write users:read groups:read im:read im:history mpim:read`
- **User scopes:** same list
- **Redirect URL:** `http://localhost:3001/api/slack/oauth/callback`
- **Events:** `message.channels` · `message.groups` · `message.im` · `message.mpim`

---

## Features

### Authentication
- Email + password · "Continue with Google" OAuth
- Google Chat **auto-connected** on Google sign-in
- First-time setup wizard (WhatsApp → Slack → Gmail)

### WhatsApp
- **Personal** — QR scan via Baileys (WhatsApp Web protocol)
- **Business API** — Meta Cloud API + webhook
- **Duplicate-number guard** — one phone number = one user globally

### Slack
- OAuth auto-imports all workspaces (public/private channels + DMs)
- Multiple workspaces + multiple Slack accounts
- Events API for real-time inbound messages

### Inbox
- Unified view across all channels
- Tab filters: All / Internal / Client comms / Unread
- Color-coded channel badges + unread counts

### Thread View & Composer
- Full message history, chat-bubble layout
- Always shows **"Replying via [Channel] · [ID]"**
- Replies routed back through exact originating channel
- Real-time updates via Socket.IO

---

## Database Schema

```
users                    — id, email, name, password_hash, google_oauth_token
whatsapp_connections     — user_id (unique), phone_number (unique globally), account_type
slack_workspaces         — user_id + team_id (unique pair), bot_token, user_token
gmail_connections        — user_id (unique), email, refresh_token
google_chat_connections  — user_id (unique), email, refresh_token
messages                 — user_id, origin_channel, origin_channel_id, origin_workspace_id,
                           thread_id, sender_name, direction, category, content_type, content
```

---

## Project Structure

```
nexus/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── .env / .env.example
│   └── src/
│       ├── index.js              Express + Socket.IO bootstrap
│       ├── config/               database.js · passport.js
│       ├── middleware/auth.js
│       ├── migrations/001_initial.sql
│       ├── routes/               auth · whatsapp · slack · gmail · googleChat · messages · settings
│       ├── services/whatsappPersonal.js  (Baileys QR manager)
│       └── socket/index.js
└── frontend/
    ├── Dockerfile · nginx.conf
    └── src/
        ├── App.jsx               Router + auth guards
        ├── api.js                Axios instance
        ├── context/AuthContext.jsx
        ├── components/           Sidebar · ChannelBadge
        └── pages/                Login · Setup · Inbox · Thread · Settings
```
