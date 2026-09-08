-- 002b: reactions, comments/replies, shares, views
CREATE TABLE reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL DEFAULT 'LIKE'
             CHECK (type IN ('LIKE','LOVE','CELEBRATE','HAHA','WOW','SAD','PROUD')),
  is_demo    boolean NOT NULL DEFAULT false,
  seed_batch uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
CREATE INDEX idx_reactions_post ON reactions(post_id, created_at);
CREATE INDEX idx_reactions_user ON reactions(user_id);
CREATE TRIGGER trg_reactions_count_ins AFTER INSERT ON reactions
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter('post_id','reactions','posts','reaction_count');
CREATE TRIGGER trg_reactions_count_del AFTER DELETE ON reactions
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter('post_id','reactions','posts','reaction_count');

-- Replies are comments with parent_comment_id set (models CommentReplies).
CREATE TABLE comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  content           text NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  status            text NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','PENDING_REVIEW','REJECTED','REMOVED')),
  moderation        jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_demo           boolean NOT NULL DEFAULT false,
  seed_batch        uuid,
  edited_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_post_created ON comments(post_id, created_at);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_demo ON comments(is_demo) WHERE is_demo;
CREATE TRIGGER trg_comments_count_ins AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter_when('post_id','comments','posts','comment_count','status','ACTIVE');
CREATE TRIGGER trg_comments_count_del AFTER DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter_when('post_id','comments','posts','comment_count','status','ACTIVE');
CREATE TRIGGER trg_comments_count_upd AFTER UPDATE OF status ON comments
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter_when('post_id','comments','posts','comment_count','status','ACTIVE');

CREATE TABLE shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption       text,
  target        text NOT NULL DEFAULT 'PROFILE' CHECK (target IN ('PROFILE','GROUP','PAGE')),
  target_id     uuid,
  target_key    text NOT NULL,
  share_post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  is_demo       boolean NOT NULL DEFAULT false,
  seed_batch    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id, target_key)
);
CREATE INDEX idx_shares_post ON shares(post_id);
CREATE TRIGGER trg_shares_count_ins AFTER INSERT ON shares
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter('post_id','shares','posts','share_count');
CREATE TRIGGER trg_shares_count_del AFTER DELETE ON shares
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter('post_id','shares','posts','share_count');

CREATE TABLE post_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  viewer_key text,
  viewed_on  date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  is_demo    boolean NOT NULL DEFAULT false,
  seed_batch uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id, viewed_on)
);
CREATE INDEX idx_post_views_post ON post_views(post_id);
CREATE TRIGGER trg_views_count_ins AFTER INSERT ON post_views
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter('post_id','post_views','posts','view_count');
CREATE TRIGGER trg_views_count_del AFTER DELETE ON post_views
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter('post_id','post_views','posts','view_count');
