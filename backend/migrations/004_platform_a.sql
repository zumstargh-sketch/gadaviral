-- 004a: conversations, messages, blocks, mutes
CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group        boolean NOT NULL DEFAULT false,
  title           text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  is_demo         boolean NOT NULL DEFAULT false,
  seed_batch      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at    timestamptz,
  is_demo         boolean NOT NULL DEFAULT false,
  seed_batch      uuid,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_conv_participants_user ON conversation_participants(user_id);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content         text NOT NULL DEFAULT '' CHECK (length(content) <= 5000),
  media_url       text,
  status          text NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT','REMOVED')),
  flagged         boolean NOT NULL DEFAULT false,
  is_demo         boolean NOT NULL DEFAULT false,
  seed_batch      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_demo ON messages(is_demo) WHERE is_demo;

CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_id);

CREATE TABLE mutes (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  until_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, muted_id),
  CHECK (user_id <> muted_id)
);
