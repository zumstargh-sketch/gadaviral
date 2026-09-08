-- 001: extensions + users + profiles + auth identities + tokens + outbox
CREATE EXTENSION IF NOT EXISTS citext;
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ─────────────────────────── USERS ───────────────────────────
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext NOT NULL UNIQUE,
  password_hash     text,
  email_verified    boolean NOT NULL DEFAULT false,
  email_verified_at timestamptz,
  role              text NOT NULL DEFAULT 'USER'
                    CHECK (role IN ('USER','MODERATOR','ADMIN','SUPER_ADMIN')),
  status            text NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','SUSPENDED','BANNED','DEACTIVATED')),
  auth_provider     text NOT NULL DEFAULT 'EMAIL'
                    CHECK (auth_provider IN ('EMAIL','GOOGLE','LINKED')),
  username          citext NOT NULL UNIQUE
                    CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  full_name         text NOT NULL,
  is_demo           boolean NOT NULL DEFAULT false,
  seed_batch        uuid,
  demo_source       text,
  suspension_reason text,
  last_login_at     timestamptz,
  password_changed_at timestamptz,
  follower_count    integer NOT NULL DEFAULT 0,
  following_count   integer NOT NULL DEFAULT 0,
  posts_count       integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX idx_users_demo ON users(is_demo) WHERE is_demo;
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created ON users(created_at);
CREATE TRIGGER trg_users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ─────────────────────────── PROFILES ───────────────────────────
CREATE TABLE profiles (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_url         text,
  cover_url          text,
  bio                text,
  date_of_birth      date,
  gender             text CHECK (gender IN ('MALE','FEMALE','OTHER') OR gender IS NULL),
  location           text,
  hometown           text,
  community          text,
  ethnic_group       text CHECK (ethnic_group IN ('GA','DANGME','KROBO','ADA','SHAI','NINGO','PRAMPRAM','OSUDOKU','OTHER','UNSPECIFIED') OR ethnic_group IS NULL),
  occupation         text,
  education          text,
  interests          text[] NOT NULL DEFAULT '{}',
  languages          text[] NOT NULL DEFAULT '{}',
  privacy            jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_community ON profiles(community);
CREATE INDEX idx_profiles_ethnic ON profiles(ethnic_group);
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ─────────────────── AUTH IDENTITIES (Google etc.) ───────────────────
CREATE TABLE auth_identities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('GOOGLE')),
  provider_user_id text NOT NULL,               -- stable Google `sub`
  provider_email   citext,
  provider_name    text,
  provider_picture text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX idx_auth_identities_user ON auth_identities(user_id);
CREATE TRIGGER trg_auth_identities_touch BEFORE UPDATE ON auth_identities
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ─────────────────────── REFRESH TOKENS ───────────────────────
CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  replaced_by uuid,
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);

-- ─────────────────────── EMAIL TOKENS (verify/OTP/reset/change) ───────────────────────
CREATE TABLE email_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('VERIFY_EMAIL','OTP_VERIFY','RESET_PASSWORD','CHANGE_EMAIL')),
  token_hash  text UNIQUE,                        -- hashed link token (single use)
  otp_hash    text,                               -- hashed 6-digit OTP
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"newEmail": "..."}
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_tokens_user ON email_tokens(user_id, purpose);

-- ─────────────────────── OUTBOX (dev log + audit of auth mail) ───────────────────────
CREATE TABLE outbox_emails (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email    text NOT NULL,
  subject     text NOT NULL,
  template    text NOT NULL,
  html        text NOT NULL,
  status      text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','FAILED','DEV_LOGGED')),
  error       text,
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_created ON outbox_emails(created_at);
