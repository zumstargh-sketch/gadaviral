-- 002a: counter helpers + posts + post_media
-- Trigger arg convention: (fk_col, subject_table, target_table, target_col [, flag_col, flag_value])
CREATE OR REPLACE FUNCTION fn_adjust_counter() RETURNS trigger AS $$
DECLARE
  v_fk text := TG_ARGV[0]; v_ttbl text := TG_ARGV[2]; v_tcol text := TG_ARGV[3];
  v_delta int; v_key uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN v_delta := 1; v_key := (to_jsonb(NEW)->>v_fk)::uuid;
  ELSIF TG_OP = 'DELETE' THEN v_delta := -1; v_key := (to_jsonb(OLD)->>v_fk)::uuid;
  END IF;
  IF v_key IS NOT NULL THEN
    EXECUTE format('UPDATE %I SET %I = GREATEST(0, %I + $1) WHERE id = $2', v_ttbl, v_tcol, v_tcol)
      USING v_delta, v_key;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_adjust_counter_when() RETURNS trigger AS $$
DECLARE
  v_fk text := TG_ARGV[0]; v_ttbl text := TG_ARGV[2]; v_tcol text := TG_ARGV[3];
  v_col text := TG_ARGV[4]; v_on text := TG_ARGV[5];
  v_delta int; v_key uuid;
BEGIN
  IF TG_OP = 'INSERT' AND (to_jsonb(NEW)->>v_col) = v_on THEN
    v_delta := 1; v_key := (to_jsonb(NEW)->>v_fk)::uuid;
  ELSIF TG_OP = 'DELETE' AND (to_jsonb(OLD)->>v_col) = v_on THEN
    v_delta := -1; v_key := (to_jsonb(OLD)->>v_fk)::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(OLD)->>v_col) = v_on AND (to_jsonb(NEW)->>v_col) <> v_on THEN
      v_delta := -1; v_key := (to_jsonb(NEW)->>v_fk)::uuid;
    ELSIF (to_jsonb(OLD)->>v_col) <> v_on AND (to_jsonb(NEW)->>v_col) = v_on THEN
      v_delta := 1; v_key := (to_jsonb(NEW)->>v_fk)::uuid;
    END IF;
  END IF;
  IF v_delta IS NOT NULL AND v_delta <> 0 AND v_key IS NOT NULL THEN
    EXECUTE format('UPDATE %I SET %I = GREATEST(0, %I + $1) WHERE id = $2', v_ttbl, v_tcol, v_tcol)
      USING v_delta, v_key;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TABLE posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           text NOT NULL DEFAULT 'TEXT'
                 CHECK (type IN ('TEXT','PHOTO','VIDEO','POLL','EVENT','BUSINESS','ANNOUNCEMENT','SHARE')),
  content        text NOT NULL DEFAULT '',
  visibility     text NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC','FOLLOWERS','GROUP','PRIVATE')),
  group_id       uuid,
  page_id        uuid,
  event_id       uuid,
  shared_post_id uuid,
  status         text NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE','PENDING_REVIEW','REJECTED','REMOVED')),
  moderation     jsonb NOT NULL DEFAULT '{}'::jsonb,
  reaction_count integer NOT NULL DEFAULT 0,
  comment_count  integer NOT NULL DEFAULT 0,
  share_count    integer NOT NULL DEFAULT 0,
  view_count     integer NOT NULL DEFAULT 0,
  is_demo        boolean NOT NULL DEFAULT false,
  seed_batch     uuid,
  demo_source    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  edited_at      timestamptz,
  deleted_at     timestamptz
);
CREATE INDEX idx_posts_author_created ON posts(author_id, created_at DESC);
CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_posts_status_created ON posts(status, created_at DESC);
CREATE INDEX idx_posts_demo ON posts(is_demo) WHERE is_demo;
CREATE INDEX idx_posts_group ON posts(group_id);
CREATE INDEX idx_posts_shared ON posts(shared_post_id);
CREATE INDEX idx_posts_trgm ON posts USING gin (content gin_trgm_ops);
CREATE TRIGGER trg_posts_touch BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_posts_count_ins AFTER INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter_when('author_id','posts','users','posts_count','status','ACTIVE');
CREATE TRIGGER trg_posts_count_del AFTER DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter_when('author_id','posts','users','posts_count','status','ACTIVE');
CREATE TRIGGER trg_posts_count_upd AFTER UPDATE OF status ON posts
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter_when('author_id','posts','users','posts_count','status','ACTIVE');

CREATE TABLE post_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_type   text NOT NULL CHECK (media_type IN ('IMAGE','VIDEO','AUDIO')),
  url          text NOT NULL,
  thumb_url    text,
  width        integer,
  height       integer,
  duration_sec integer,
  alt_text     text,
  position     integer NOT NULL DEFAULT 0,
  is_demo      boolean NOT NULL DEFAULT false,
  seed_batch   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_post_media_post ON post_media(post_id, position);
