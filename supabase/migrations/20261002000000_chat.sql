-- Chat-first Crost: conversations with Orc. A chat message may carry a proposed plan (meta.plan);
-- running it creates a goal (meta.goal_id) handled by the existing department engine.
CREATE TABLE IF NOT EXISTS chats (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  TEXT        NOT NULL,
  title       TEXT        NOT NULL DEFAULT 'New chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chats_owner_updated ON chats (created_by, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     UUID        NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  created_by  TEXT        NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL DEFAULT '',
  meta        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages (chat_id, created_at);

-- Same access model as every other table: RLS on, no policies, nothing for the Data API roles.
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chats, chat_messages FROM anon, authenticated, service_role;
