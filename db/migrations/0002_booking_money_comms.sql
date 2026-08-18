-- =========================================================================
-- 0002 — booking, money, communication, quality, tours (Phases 2 and 3)
--
-- The load-bearing rules live here rather than in application code:
--   * a ledger posting group must balance to zero (deferred trigger)
--   * ledger entries, payments and notifications are append-only or
--     state-machine guarded
--   * one published review per completed booking
--   * a review token is single use
-- =========================================================================

CREATE TYPE payment_kind    AS ENUM ('AUTHORIZATION','CAPTURE','REFUND','CASH_COLLECTION');
CREATE TYPE payment_state   AS ENUM ('PENDING','SUCCEEDED','FAILED','CANCELLED');
CREATE TYPE ledger_side     AS ENUM ('DEBIT','CREDIT');
CREATE TYPE account_kind    AS ENUM (
  'CARD_CLEARING',       -- money held by the payment provider on our behalf
  'CASH_WITH_DRIVER',    -- fare the driver collected directly from the traveller
  'PLATFORM_REVENUE',    -- our commission, earned
  'DRIVER_PAYABLE',      -- we owe the driver (card trips)
  'DRIVER_RECEIVABLE',   -- the driver owes us commission (cash trips)
  'REFUNDS',             -- money returned to travellers
  'PAYOUTS');            -- money sent to drivers
CREATE TYPE payout_state    AS ENUM ('DRAFT','APPROVED','SENT','FAILED','CANCELLED');
CREATE TYPE notify_channel  AS ENUM ('EMAIL','SMS','PUSH');
CREATE TYPE notify_state    AS ENUM ('QUEUED','SENDING','SENT','FAILED','SUPPRESSED');
CREATE TYPE message_sender  AS ENUM ('CUSTOMER','DRIVER','STAFF','SYSTEM');
CREATE TYPE review_status   AS ENUM ('SUBMITTED','PUBLISHED','REJECTED','REDACTED');

-- ------------------------------------------------------- booking detail ---
ALTER TABLE bookings
  ADD COLUMN customer_name       TEXT,
  ADD COLUMN contact_locale      TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN pickup_address      TEXT,
  ADD COLUMN dropoff_address     TEXT,
  ADD COLUMN flight_number       TEXT,
  ADD COLUMN pickup_sign_name    TEXT,
  ADD COLUMN passengers          INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN children            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN luggage             INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN child_seats         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN pets                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN notes               TEXT,
  ADD COLUMN drive_minutes       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN distance_km100      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN cancelled_at        TIMESTAMPTZ,
  ADD COLUMN cancelled_by        TEXT,
  ADD COLUMN cancellation_reason TEXT,
  ADD COLUMN cancellation_fee_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN completed_at        TIMESTAMPTZ,
  ADD COLUMN cash_confirmed_at   TIMESTAMPTZ;

CREATE TABLE booking_legs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  location_id  UUID REFERENCES locations(id),
  label        TEXT NOT NULL,
  day_index    INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  UNIQUE (booking_id, position)
);

-- Price, driver, date and route changes create a revision. The original is
-- never overwritten, so a dispute can always be reconstructed.
CREATE TABLE booking_revisions (
  id                 BIGSERIAL PRIMARY KEY,
  booking_id         UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  before             JSONB NOT NULL,
  after              JSONB NOT NULL,
  price_delta_minor  BIGINT NOT NULL DEFAULT 0,
  reason             TEXT NOT NULL,
  actor_id           UUID REFERENCES users(id),
  customer_accepted  BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER booking_revisions_no_update BEFORE UPDATE OR DELETE ON booking_revisions
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- --------------------------------------------------------------- money ----
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind            payment_kind NOT NULL,
  state           payment_state NOT NULL DEFAULT 'PENDING',
  provider        TEXT NOT NULL,
  provider_ref    TEXT,
  amount_minor    BIGINT NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'GEL',
  idempotency_key TEXT NOT NULL UNIQUE,
  failure_code    TEXT,
  raw             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at      TIMESTAMPTZ,
  CONSTRAINT payment_amount_positive CHECK (amount_minor > 0)
);
CREATE INDEX payments_booking_idx ON payments (booking_id);
CREATE UNIQUE INDEX payments_provider_ref_uq ON payments (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;

-- Every provider callback is stored raw and processed exactly once.
CREATE TABLE webhook_events (
  id            BIGSERIAL PRIMARY KEY,
  provider      TEXT NOT NULL,
  event_id      TEXT NOT NULL,
  event_type    TEXT,
  payload       JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ,
  process_error TEXT,
  UNIQUE (provider, event_id)
);

CREATE TABLE ledger_accounts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       account_kind NOT NULL,
  driver_id  UUID REFERENCES driver_profiles(id) ON DELETE CASCADE,
  currency   TEXT NOT NULL DEFAULT 'GEL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One account per (kind, driver). Platform-wide accounts have driver_id NULL.
CREATE UNIQUE INDEX ledger_accounts_driver_uq ON ledger_accounts (kind, driver_id, currency)
  WHERE driver_id IS NOT NULL;
CREATE UNIQUE INDEX ledger_accounts_platform_uq ON ledger_accounts (kind, currency)
  WHERE driver_id IS NULL;

CREATE TABLE ledger_entries (
  id            BIGSERIAL PRIMARY KEY,
  posting_group UUID NOT NULL,
  account_id    UUID NOT NULL REFERENCES ledger_accounts(id),
  side          ledger_side NOT NULL,
  amount_minor  BIGINT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'GEL',
  booking_id    UUID REFERENCES bookings(id),
  payment_id    UUID REFERENCES payments(id),
  memo          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ledger_amount_positive CHECK (amount_minor > 0)
);
CREATE INDEX ledger_entries_account_idx ON ledger_entries (account_id, created_at);
CREATE INDEX ledger_entries_group_idx   ON ledger_entries (posting_group);
CREATE INDEX ledger_entries_booking_idx ON ledger_entries (booking_id);
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- Double entry is only meaningful if it actually balances. Checked at COMMIT
-- so a posting group can be written across several statements.
CREATE OR REPLACE FUNCTION ledger_group_balances() RETURNS trigger AS $$
DECLARE
  debit  BIGINT;
  credit BIGINT;
BEGIN
  SELECT
    coalesce(sum(amount_minor) FILTER (WHERE side = 'DEBIT'), 0),
    coalesce(sum(amount_minor) FILTER (WHERE side = 'CREDIT'), 0)
  INTO debit, credit
  FROM ledger_entries WHERE posting_group = NEW.posting_group;

  IF debit <> credit THEN
    RAISE EXCEPTION 'ledger posting group % does not balance: debits %, credits %',
      NEW.posting_group, debit, credit;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_group_balances();

-- Cash trips create commission debt. A driver who owes too much, for too
-- long, stops being offered new cash work — but may still take card work.
CREATE TABLE driver_wallets (
  driver_id          UUID PRIMARY KEY REFERENCES driver_profiles(id) ON DELETE CASCADE,
  credit_limit_minor BIGINT NOT NULL DEFAULT 20000,
  currency           TEXT NOT NULL DEFAULT 'GEL',
  blocked_at         TIMESTAMPTZ,
  blocked_reason     TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_limit_nonneg CHECK (credit_limit_minor >= 0)
);

CREATE TABLE payouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     UUID NOT NULL REFERENCES driver_profiles(id),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  amount_minor  BIGINT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'GEL',
  state         payout_state NOT NULL DEFAULT 'DRAFT',
  reference     TEXT,
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  failure       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payout_period_order CHECK (period_end >= period_start)
);
CREATE INDEX payouts_driver_idx ON payouts (driver_id, period_end DESC);

-- ------------------------------------------------------- notifications ----
-- Outbox: written in the same transaction as the change that caused it, so a
-- confirmation can never be lost between the database and the sender.
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL,
  channel     notify_channel NOT NULL,
  to_address  TEXT NOT NULL,
  locale      TEXT NOT NULL DEFAULT 'en',
  subject     TEXT,
  body        TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
  state       notify_state NOT NULL DEFAULT 'QUEUED',
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  dedupe_key  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ
);
CREATE INDEX notifications_pending_idx ON notifications (state, created_at)
  WHERE state IN ('QUEUED','FAILED');

-- ----------------------------------------------------------- messaging ----
CREATE TABLE messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender         message_sender NOT NULL,
  sender_user_id UUID REFERENCES users(id),
  body           TEXT NOT NULL,
  flagged        BOOLEAN NOT NULL DEFAULT false,
  flag_reason    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at        TIMESTAMPTZ,
  CONSTRAINT message_body_length CHECK (char_length(body) BETWEEN 1 AND 4000)
);
CREATE INDEX messages_booking_idx ON messages (booking_id, created_at);

-- ------------------------------------------------------------- reviews ----
CREATE TABLE review_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  driver_id            UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  rating_overall       SMALLINT NOT NULL,
  rating_safety        SMALLINT,
  rating_punctuality   SMALLINT,
  rating_cleanliness   SMALLINT,
  rating_communication SMALLINT,
  author_name          TEXT,
  body                 TEXT,
  source_locale        TEXT NOT NULL DEFAULT 'en',
  status               review_status NOT NULL DEFAULT 'SUBMITTED',
  published_body       TEXT,
  moderator_id         UUID REFERENCES users(id),
  moderated_at         TIMESTAMPTZ,
  moderation_reason    TEXT,
  driver_response      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rating_range CHECK (
    rating_overall BETWEEN 1 AND 5
    AND (rating_safety        IS NULL OR rating_safety        BETWEEN 1 AND 5)
    AND (rating_punctuality   IS NULL OR rating_punctuality   BETWEEN 1 AND 5)
    AND (rating_cleanliness   IS NULL OR rating_cleanliness   BETWEEN 1 AND 5)
    AND (rating_communication IS NULL OR rating_communication BETWEEN 1 AND 5))
);
CREATE INDEX reviews_driver_published_idx ON reviews (driver_id, created_at DESC)
  WHERE status = 'PUBLISHED';

-- --------------------------------------------------------------- tours ----
CREATE TABLE tours (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  origin_id         UUID NOT NULL REFERENCES locations(id),
  duration_days     INTEGER NOT NULL DEFAULT 1,
  distance_km       NUMERIC(8,2) NOT NULL,
  drive_minutes     INTEGER NOT NULL,
  return_km         NUMERIC(8,2) NOT NULL DEFAULT 0,
  deadhead_recovery_bps INTEGER NOT NULL DEFAULT 0,
  risk_factor_bps   INTEGER NOT NULL DEFAULT 10000,
  min_fare_minor    BIGINT NOT NULL DEFAULT 0,
  requires_4x4      BOOLEAN NOT NULL DEFAULT false,
  hero_image_key    TEXT,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tour_duration_sane CHECK (duration_days BETWEEN 1 AND 10)
);

CREATE TABLE tour_translations (
  tour_id   UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  locale    TEXT NOT NULL,
  title     TEXT NOT NULL,
  summary   TEXT NOT NULL,
  body      TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tour_id, locale)
);

CREATE TABLE tour_stops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id     UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id),
  day_index   INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL,
  leg_km      NUMERIC(8,2),
  notes       TEXT,
  UNIQUE (tour_id, position)
);

-- ------------------------------------------------- cancellation policy ----
CREATE TABLE cancellation_policies (
  version              TEXT PRIMARY KEY,
  free_cutoff_hours    INTEGER NOT NULL DEFAULT 24,
  late_fee_bps         INTEGER NOT NULL DEFAULT 0,
  no_show_fee_bps      INTEGER NOT NULL DEFAULT 0,
  no_show_grace_minutes INTEGER NOT NULL DEFAULT 30,
  effective_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  active               BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO cancellation_policies (version, free_cutoff_hours, late_fee_bps, no_show_fee_bps)
VALUES ('policy-2026-08-v1', 24, 0, 0);

-- Seed the platform-wide ledger accounts.
INSERT INTO ledger_accounts (kind, driver_id, currency) VALUES
  ('CARD_CLEARING',   NULL, 'GEL'),
  ('CASH_WITH_DRIVER',NULL, 'GEL'),
  ('PLATFORM_REVENUE',NULL, 'GEL'),
  ('REFUNDS',         NULL, 'GEL'),
  ('PAYOUTS',         NULL, 'GEL');
