-- 002c: follows, notifications
CREATE TABLE follows (
  follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_demo     boolean NOT NULL DEFAULT false,
  seed_batch  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX idx_follows_followee ON follows(followee_id);
CREATE TRIGGER trg_follows_ins AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter('followee_id','follows','users','follower_count');
CREATE TRIGGER trg_follows_del AFTER DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter('followee_id','follows','users','follower_count');
CREATE TRIGGER trg_follows_ins2 AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter('follower_id','follows','users','following_count');
CREATE TRIGGER trg_follows_del2 AFTER DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter('follower_id','follows','users','following_count');

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  type        text NOT NULL CHECK (type IN
              ('REACTION','COMMENT','REPLY','SHARE','FOLLOW','MESSAGE','EVENT','SYSTEM','MODERATION','GROUP')),
  entity_type text CHECK (entity_type IN ('post','comment','user','conversation','event','group','report','system')),
  entity_id   uuid,
  body        text,
  is_demo     boolean NOT NULL DEFAULT false,
  seed_batch  uuid,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
