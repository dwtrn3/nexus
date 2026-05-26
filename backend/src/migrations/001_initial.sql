-- Nexus Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  google_oauth_token JSONB,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WhatsApp connections (one per user, one per phone number globally)
CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) UNIQUE NOT NULL,
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('business_api', 'personal')),
  wa_credentials JSONB,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'disconnected', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Slack workspaces (multiple per user)
CREATE TABLE IF NOT EXISTS slack_workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id VARCHAR(100) NOT NULL,
  team_name VARCHAR(255) NOT NULL,
  bot_token TEXT,
  user_token TEXT,
  channel_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, team_id)
);

-- Gmail connections
CREATE TABLE IF NOT EXISTS gmail_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  status VARCHAR(20) DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Google Chat connections
CREATE TABLE IF NOT EXISTS google_chat_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255),
  refresh_token TEXT,
  status VARCHAR(20) DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin_channel VARCHAR(50) NOT NULL CHECK (origin_channel IN ('whatsapp', 'slack', 'gmail', 'google_chat')),
  origin_channel_id TEXT NOT NULL,
  origin_workspace_id UUID REFERENCES slack_workspaces(id) ON DELETE SET NULL,
  thread_id TEXT NOT NULL,
  sender_name VARCHAR(255),
  sender_id TEXT,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  category VARCHAR(20) NOT NULL CHECK (category IN ('internal', 'client')),
  content_type VARCHAR(20) DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'video', 'audio', 'file', 'email')),
  content TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_origin_channel ON messages(origin_channel);
CREATE INDEX IF NOT EXISTS idx_messages_category ON messages(category);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_whatsapp_updated_at BEFORE UPDATE ON whatsapp_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_slack_updated_at BEFORE UPDATE ON slack_workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_gmail_updated_at BEFORE UPDATE ON gmail_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_gchat_updated_at BEFORE UPDATE ON google_chat_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
