-- 004b: reports, moderation actions, audit logs, demo metadata, push tokens
CREATE TABLE reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type     text NOT NULL CHECK (target_type IN
                  ('USER','POST','COMMENT','MESSAGE','GROUP','PAGE','BUSINESS','EVENT')),
  target_id       uuid NOT NULL,
  category        text NOT NULL CHECK (category IN
                  ('SPAM','HARASSMENT','HATE_SPEECH','SEXUAL_CONTENT','VIOLENCE_THREATS',
                   'SCAM_FRAUD','MISINFORMATION','IMPERSONATION','SELF_HARM','OTHER')),
  details         text,
  status          text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWING','RESOLVED','DISMISSED')),
  handled_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution_note text,
  is_demo         boolean NOT NULL DEFAULT false,
  seed_batch      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX idx_reports_target ON reports(target_type, target_id);
CREATE TRIGGER trg_reports_touch BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TABLE moderation_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      text NOT NULL CHECK (action IN
              ('REMOVE_POST','RESTORE_POST','REMOVE_COMMENT','UNLIST_CONTENT','WARN_USER',
               'SUSPEND_USER','UNSUSPEND_USER','BAN_USER','UNBAN_USER','DISMISS_REPORT',
               'RESOLVE_REPORT','VERIFY_BUSINESS','OTHER')),
  target_type text NOT NULL,
  target_id   uuid,
  reason      text,
  report_id   uuid REFERENCES reports(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mod_actions_moderator ON moderation_actions(moderator_id, created_at DESC);

CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity_type text,
  entity_id   uuid,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);

CREATE TABLE demo_seed_metadata (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch        uuid NOT NULL UNIQUE,
  label        text NOT NULL DEFAULT 'DEMO/SEED DATA',
  created_by   text,
  user_count   integer NOT NULL DEFAULT 0,
  post_count   integer NOT NULL DEFAULT 0,
  stats        jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  wiped_at     timestamptz
);

CREATE TABLE push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   text NOT NULL CHECK (platform IN ('ANDROID','WINDOWS','WEB')),
  token      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);
