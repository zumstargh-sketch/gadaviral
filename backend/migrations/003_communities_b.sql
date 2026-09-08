-- 003b: businesses, events, event members
CREATE TABLE businesses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          citext NOT NULL UNIQUE,
  name          text NOT NULL,
  category      text NOT NULL CHECK (category IN
                ('RESTAURANT','FASHION','FOOD_VENDOR','EVENT_SERVICES','PHOTOGRAPHY','TRANSPORT',
                 'PROFESSIONAL','ARTISAN','TOURISM','CATERING','DIGITAL','LOCAL_SHOP','OTHER')),
  description   text NOT NULL DEFAULT '',
  owner_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  phone         text,
  email         text,
  website       text,
  address       text,
  area          text,
  logo_url      text,
  cover_url     text,
  opening_hours text,
  verified      boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PENDING_REVIEW','REMOVED')),
  is_demo       boolean NOT NULL DEFAULT false,
  seed_batch    uuid,
  demo_source   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_businesses_category ON businesses(category);
CREATE INDEX idx_businesses_demo ON businesses(is_demo) WHERE is_demo;
CREATE INDEX idx_businesses_name_trgm ON businesses USING gin (name gin_trgm_ops);
CREATE TRIGGER trg_businesses_touch BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TABLE events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         citext NOT NULL UNIQUE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  category     text NOT NULL DEFAULT 'COMMUNITY',
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz,
  location     text NOT NULL DEFAULT '',
  community    text,
  cover_url    text,
  online_url   text,
  organizer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  group_id     uuid REFERENCES groups(id) ON DELETE SET NULL,
  capacity     integer,
  status       text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED','PENDING_REVIEW')),
  seed_note    text,
  is_demo      boolean NOT NULL DEFAULT false,
  seed_batch   uuid,
  demo_source  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_starts ON events(starts_at);
CREATE INDEX idx_events_demo ON events(is_demo) WHERE is_demo;
CREATE INDEX idx_events_title_trgm ON events USING gin (title gin_trgm_ops);
CREATE TRIGGER trg_events_touch BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TABLE event_members (
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rsvp       text NOT NULL DEFAULT 'GOING' CHECK (rsvp IN ('GOING','INTERESTED')),
  is_demo    boolean NOT NULL DEFAULT false,
  seed_batch uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX idx_event_members_user ON event_members(user_id);
