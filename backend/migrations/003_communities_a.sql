-- 003a: groups + pages
CREATE TABLE groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         citext NOT NULL UNIQUE,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  category     text NOT NULL DEFAULT 'COMMUNITY',
  cover_url    text,
  avatar_url   text,
  privacy      text NOT NULL DEFAULT 'PUBLIC' CHECK (privacy IN ('PUBLIC','PRIVATE')),
  creator_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  member_count integer NOT NULL DEFAULT 0,
  is_demo      boolean NOT NULL DEFAULT false,
  seed_batch   uuid,
  demo_source  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_groups_category ON groups(category);
CREATE INDEX idx_groups_demo ON groups(is_demo) WHERE is_demo;
CREATE INDEX idx_groups_name_trgm ON groups USING gin (name gin_trgm_ops);
CREATE TRIGGER trg_groups_touch BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TABLE group_members (
  group_id   uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER','ADMIN','MODERATOR','MEMBER')),
  status     text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PENDING','BANNED')),
  is_demo    boolean NOT NULL DEFAULT false,
  seed_batch uuid,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE TRIGGER trg_gmembers_ins AFTER INSERT ON group_members
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter_when('group_id','group_members','groups','member_count','status','ACTIVE');
CREATE TRIGGER trg_gmembers_del AFTER DELETE ON group_members
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter_when('group_id','group_members','groups','member_count','status','ACTIVE');
CREATE TRIGGER trg_gmembers_upd AFTER UPDATE OF status ON group_members
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter_when('group_id','group_members','groups','member_count','status','ACTIVE');

CREATE TABLE pages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           citext NOT NULL UNIQUE,
  name           text NOT NULL,
  category       text NOT NULL DEFAULT 'COMMUNITY',
  description    text NOT NULL DEFAULT '',
  avatar_url     text,
  cover_url      text,
  owner_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  verified       boolean NOT NULL DEFAULT false,
  follower_count integer NOT NULL DEFAULT 0,
  is_demo        boolean NOT NULL DEFAULT false,
  seed_batch     uuid,
  demo_source    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pages_category ON pages(category);
CREATE INDEX idx_pages_demo ON pages(is_demo) WHERE is_demo;
CREATE INDEX idx_pages_name_trgm ON pages USING gin (name gin_trgm_ops);
CREATE TRIGGER trg_pages_touch BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TABLE page_followers (
  page_id    uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_demo    boolean NOT NULL DEFAULT false,
  seed_batch uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, user_id)
);
CREATE TRIGGER trg_pfollowers_ins AFTER INSERT ON page_followers
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter('page_id','page_followers','pages','follower_count');
CREATE TRIGGER trg_pfollowers_del AFTER DELETE ON page_followers
  FOR EACH ROW EXECUTE FUNCTION fn_adjust_counter('page_id','page_followers','pages','follower_count');
