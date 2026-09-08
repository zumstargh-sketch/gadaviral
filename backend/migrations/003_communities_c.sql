-- 003c: polls
CREATE TABLE polls (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  question   text NOT NULL,
  multiple   boolean NOT NULL DEFAULT false,
  ends_at    timestamptz,
  is_demo    boolean NOT NULL DEFAULT false,
  seed_batch uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_polls_post ON polls(post_id);

CREATE TABLE poll_options (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id    uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label      text NOT NULL,
  position   integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_poll_options_poll ON poll_options(poll_id, position);

CREATE TABLE poll_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id   uuid NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_demo     boolean NOT NULL DEFAULT false,
  seed_batch  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, poll_id, option_id)
);
CREATE INDEX idx_poll_votes_poll ON poll_votes(poll_id);
