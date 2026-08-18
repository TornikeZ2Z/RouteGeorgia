-- =========================================================================
-- 0001_baseline.sql — Phase 0 schema baseline
--
-- Conventions enforced here rather than in application code:
--   * All money is BIGINT in minor units (tetri) + explicit currency. Never float.
--   * All instants are TIMESTAMPTZ (UTC). Service-local wall time is derived
--     from an explicit IANA timezone column, never from the server locale.
--   * Driver availability cannot overlap. Enforced by an EXCLUDE constraint,
--     not by application-level checking.
--   * Audit log is append-only. UPDATE/DELETE are blocked by trigger.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- required for the availability EXCLUDE
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()

-- ---------------------------------------------------------------- enums ---
CREATE TYPE user_status        AS ENUM ('ACTIVE','PENDING','SUSPENDED','CLOSED');
CREATE TYPE app_role           AS ENUM (
  'CUSTOMER','DRIVER_APPLICANT','DRIVER',
  'SUPPORT_AGENT','OPERATIONS_MANAGER','FINANCE_ADMIN','CONTENT_ADMIN','SUPER_ADMIN');
CREATE TYPE driver_status      AS ENUM (
  'DRAFT','SUBMITTED','IN_REVIEW','CHANGES_REQUESTED','APPROVED','SUSPENDED','REJECTED');
CREATE TYPE doc_type           AS ENUM (
  'IDENTITY','DRIVING_LICENSE','VEHICLE_REGISTRATION','INSURANCE','INSPECTION','TRAINING','OTHER');
CREATE TYPE review_state       AS ENUM ('PENDING','APPROVED','CHANGES_REQUESTED','REJECTED','EXPIRED');
CREATE TYPE proficiency        AS ENUM ('BASIC','CONVERSATIONAL','FLUENT','NATIVE');
CREATE TYPE vehicle_class      AS ENUM ('ECONOMY','COMFORT','MINIVAN','SUV_4X4','MINIBUS','PREMIUM');
CREATE TYPE vehicle_status     AS ENUM ('DRAFT','SUBMITTED','APPROVED','SUSPENDED','RETIRED');
CREATE TYPE location_type      AS ENUM ('AIRPORT','CITY','TOWN','ATTRACTION','RESORT','BORDER','ADDRESS');
CREATE TYPE plan_status        AS ENUM ('DRAFT','PENDING_APPROVAL','ACTIVE','SUPERSEDED','REJECTED');
CREATE TYPE block_kind         AS ENUM ('BOOKING','BUSY','TIME_OFF','REST_BUFFER');
CREATE TYPE quote_status       AS ENUM ('OPEN','HELD','CONSUMED','EXPIRED');
CREATE TYPE booking_status     AS ENUM (
  'DRAFT','HELD','PENDING_PAYMENT','CONFIRMED','DRIVER_ACKNOWLEDGED','READY',
  'DRIVER_ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED','REASSIGNING','DISPUTED','CLOSED','EXPIRED');
CREATE TYPE payment_mode       AS ENUM ('CASH','CARD');

-- ------------------------------------------------------- identity/access ---
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL,
  email_normalized  TEXT GENERATED ALWAYS AS (lower(email)) STORED,
  phone             TEXT,
  password_hash     TEXT,
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  locale            TEXT NOT NULL DEFAULT 'en',
  status            user_status NOT NULL DEFAULT 'ACTIVE',
  mfa_enrolled_at   TIMESTAMPTZ,
  last_auth_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_locale_supported CHECK (locale IN ('en','ka','ru'))
);
CREATE UNIQUE INDEX users_email_uq ON users (email_normalized);

CREATE TABLE user_roles (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       app_role NOT NULL,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,   -- only the hash is stored, never the token
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE login_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE consents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,          -- terms | privacy | driver_agreement | marketing
  policy_version TEXT NOT NULL,
  locale         TEXT NOT NULL,
  accepted       BOOLEAN NOT NULL,
  accepted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence       JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ---------------------------------------------------- locations & routes ---
CREATE TABLE locations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  type              location_type NOT NULL,
  name_en           TEXT NOT NULL,
  name_ka           TEXT,
  name_ru           TEXT,
  region            TEXT,
  lat               DOUBLE PRECISION NOT NULL,
  lon               DOUBLE PRECISION NOT NULL,
  timezone          TEXT NOT NULL DEFAULT 'Asia/Tbilisi',
  provider_place_id TEXT,
  in_service_area   BOOLEAN NOT NULL DEFAULT true,
  seo_indexed       BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT locations_lat_range CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT locations_lon_range CHECK (lon BETWEEN -180 AND 180)
);

-- A route family is a priced corridor (e.g. Tbilisi Airport -> Kazbegi).
-- return_km + deadhead_recovery_bps make the empty return leg an explicit,
-- auditable price input instead of something drivers silently bake into a
-- single per-km rate. This is the main correction to the source specification.
CREATE TABLE route_families (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   TEXT NOT NULL UNIQUE,
  origin_id              UUID NOT NULL REFERENCES locations(id),
  destination_id         UUID NOT NULL REFERENCES locations(id),
  distance_km            NUMERIC(8,2) NOT NULL,
  drive_minutes          INTEGER NOT NULL,
  return_km              NUMERIC(8,2) NOT NULL,
  deadhead_recovery_bps  INTEGER NOT NULL DEFAULT 5000,  -- share of return leg charged
  risk_factor_bps        INTEGER NOT NULL DEFAULT 10000, -- 10000 = 1.00x (mountain/winter)
  min_fare_minor         BIGINT  NOT NULL DEFAULT 0,
  requires_4x4           BOOLEAN NOT NULL DEFAULT false,
  seasonal_note          TEXT,
  active                 BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rf_distinct_endpoints CHECK (origin_id <> destination_id),
  CONSTRAINT rf_distance_positive  CHECK (distance_km > 0 AND drive_minutes > 0),
  CONSTRAINT rf_return_nonneg      CHECK (return_km >= 0),
  CONSTRAINT rf_deadhead_range     CHECK (deadhead_recovery_bps BETWEEN 0 AND 10000),
  CONSTRAINT rf_risk_range         CHECK (risk_factor_bps BETWEEN 10000 AND 20000),
  CONSTRAINT rf_minfare_nonneg     CHECK (min_fare_minor >= 0)
);
CREATE UNIQUE INDEX route_families_pair_uq ON route_families (origin_id, destination_id);

-- --------------------------------------------------------------- supply ---
CREATE TABLE driver_profiles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  handle             TEXT NOT NULL UNIQUE,
  legal_first_name   TEXT,
  legal_last_name    TEXT,
  public_name        TEXT NOT NULL,
  date_of_birth      DATE,
  base_location_id   UUID REFERENCES locations(id),
  bio                TEXT,
  emergency_contact  TEXT,
  status             driver_status NOT NULL DEFAULT 'DRAFT',
  published          BOOLEAN NOT NULL DEFAULT false,
  suspended_reason   TEXT,
  rating_sum         INTEGER NOT NULL DEFAULT 0,
  rating_count       INTEGER NOT NULL DEFAULT 0,
  completed_trips    INTEGER NOT NULL DEFAULT 0,
  ack_on_time        INTEGER NOT NULL DEFAULT 0,
  ack_total          INTEGER NOT NULL DEFAULT 0,
  driver_cancels     INTEGER NOT NULL DEFAULT 0,
  submitted_at       TIMESTAMPTZ,
  approved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A profile may only be published from the APPROVED state.
  CONSTRAINT driver_publish_requires_approval
    CHECK (published = false OR status = 'APPROVED')
);

CREATE TABLE driver_languages (
  driver_id       UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  language        TEXT NOT NULL,
  declared_level  proficiency NOT NULL,
  verified_level  proficiency,             -- set by interview; NULL = unverified claim
  verified_by     UUID REFERENCES users(id),
  verified_at     TIMESTAMPTZ,
  PRIMARY KEY (driver_id, language)
);

CREATE TABLE vehicles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  make         TEXT NOT NULL,
  model        TEXT NOT NULL,
  year         INTEGER NOT NULL,
  color        TEXT,
  plate        TEXT NOT NULL,
  class        vehicle_class NOT NULL,
  body         TEXT,
  seats        INTEGER NOT NULL,
  luggage      INTEGER NOT NULL DEFAULT 0,
  amenities    JSONB NOT NULL DEFAULT '{}'::jsonb,   -- wifi, ac, pets, child_seat, smoke_free
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,   -- four_wheel_drive, winter_tyres, step_height
  status       vehicle_status NOT NULL DEFAULT 'DRAFT',
  published    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_year_sane  CHECK (year BETWEEN 1990 AND 2100),
  CONSTRAINT vehicle_seats_sane CHECK (seats BETWEEN 1 AND 60),
  CONSTRAINT vehicle_publish_requires_approval
    CHECK (published = false OR status = 'APPROVED')
);
CREATE UNIQUE INDEX vehicles_plate_uq ON vehicles (upper(replace(plate,' ','')));

CREATE TABLE vehicle_media (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id       UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  storage_key      TEXT NOT NULL,
  position         INTEGER NOT NULL DEFAULT 0,
  view_type        TEXT,
  alt_text         TEXT,
  checksum         TEXT,
  moderation_state review_state NOT NULL DEFAULT 'PENDING',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Document expiry must be queryable without opening the encrypted file, so
-- expires_on is a plain column while the document number is only ever hashed.
CREATE TABLE driver_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  vehicle_id    UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  type          doc_type NOT NULL,
  storage_key   TEXT NOT NULL,
  number_hash   TEXT,
  mime_type     TEXT,
  size_bytes    INTEGER,
  checksum      TEXT,
  issued_on     DATE,
  expires_on    DATE,
  is_mandatory  BOOLEAN NOT NULL DEFAULT true,
  state         review_state NOT NULL DEFAULT 'PENDING',
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  review_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX driver_documents_expiry_idx ON driver_documents (expires_on)
  WHERE state = 'APPROVED' AND is_mandatory;
CREATE INDEX driver_documents_driver_idx ON driver_documents (driver_id, type);

CREATE TABLE driver_decisions (
  id         BIGSERIAL PRIMARY KEY,
  driver_id  UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  from_state driver_status NOT NULL,
  to_state   driver_status NOT NULL,
  reason     TEXT NOT NULL,
  actor_id   UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------- pricing ---
CREATE TABLE price_bands (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class                  vehicle_class NOT NULL UNIQUE,
  currency               TEXT NOT NULL DEFAULT 'GEL',
  min_rate_per_km_minor  BIGINT NOT NULL,
  max_rate_per_km_minor  BIGINT NOT NULL,
  min_fare_floor_minor   BIGINT NOT NULL,
  max_fare_ceiling_minor BIGINT NOT NULL,
  max_overnight_minor    BIGINT NOT NULL DEFAULT 0,
  max_season_factor_bps  INTEGER NOT NULL DEFAULT 13000,
  active                 BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT band_rate_order CHECK (min_rate_per_km_minor <= max_rate_per_km_minor),
  CONSTRAINT band_fare_order CHECK (min_fare_floor_minor <= max_fare_ceiling_minor)
);

CREATE TABLE price_plans (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id            UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  vehicle_id           UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  version              INTEGER NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'GEL',
  rate_per_km_minor    BIGINT NOT NULL,
  rate_per_minute_minor BIGINT NOT NULL DEFAULT 0,
  per_stop_fee_minor   BIGINT NOT NULL DEFAULT 0,
  overnight_fee_minor  BIGINT NOT NULL DEFAULT 0,
  minimum_fare_minor   BIGINT NOT NULL DEFAULT 0,
  season_factor_bps    INTEGER NOT NULL DEFAULT 10000,
  status               plan_status NOT NULL DEFAULT 'DRAFT',
  effective_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to         TIMESTAMPTZ,
  approved_by          UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_money_nonneg CHECK (
    rate_per_km_minor >= 0 AND rate_per_minute_minor >= 0 AND per_stop_fee_minor >= 0
    AND overnight_fee_minor >= 0 AND minimum_fare_minor >= 0),
  CONSTRAINT plan_season_range CHECK (season_factor_bps BETWEEN 8000 AND 20000),
  CONSTRAINT plan_effective_order CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE UNIQUE INDEX price_plans_version_uq ON price_plans (vehicle_id, version);
-- Exactly one ACTIVE plan per vehicle at a time.
CREATE UNIQUE INDEX price_plans_one_active ON price_plans (vehicle_id)
  WHERE status = 'ACTIVE';

CREATE TABLE exchange_rates (
  id         BIGSERIAL PRIMARY KEY,
  base       TEXT NOT NULL,
  quote      TEXT NOT NULL,
  rate_micro BIGINT NOT NULL,   -- 1 base = rate_micro / 1e6 quote
  as_of      TIMESTAMPTZ NOT NULL,
  provider   TEXT NOT NULL
);
CREATE UNIQUE INDEX exchange_rates_uq ON exchange_rates (base, quote, as_of);

-- --------------------------------------------------------- availability ---
-- The EXCLUDE constraint is the single source of truth for "a driver cannot
-- be in two places at once". Application code must never be the only guard.
CREATE TABLE availability_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  period          TSTZRANGE NOT NULL,
  kind            block_kind NOT NULL,
  booking_id      UUID,
  reason_category TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT availability_period_nonempty CHECK (NOT isempty(period)),
  CONSTRAINT availability_no_overlap
    EXCLUDE USING gist (driver_id WITH =, period WITH &&)
);
CREATE INDEX availability_driver_period_idx ON availability_blocks USING gist (driver_id, period);

-- ------------------------------------------------- searches and quoting ---
CREATE TABLE route_searches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key    TEXT,
  origin_id      UUID REFERENCES locations(id),
  destination_id UUID REFERENCES locations(id),
  itinerary      JSONB NOT NULL,
  itinerary_hash TEXT NOT NULL,
  travel_at      TIMESTAMPTZ NOT NULL,
  service_tz     TEXT NOT NULL DEFAULT 'Asia/Tbilisi',
  passengers     INTEGER NOT NULL DEFAULT 1,
  luggage        INTEGER NOT NULL DEFAULT 0,
  attribution    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL
);
CREATE INDEX route_searches_hash_idx ON route_searches (itinerary_hash);

-- A quote is an immutable snapshot. Nothing outside the engine may modify
-- the breakdown, and replaying `inputs` through `engine_version` must
-- reproduce `gross_minor` exactly. That property is under test.
CREATE TABLE quotes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id          UUID NOT NULL REFERENCES route_searches(id) ON DELETE CASCADE,
  driver_id          UUID NOT NULL REFERENCES driver_profiles(id),
  vehicle_id         UUID NOT NULL REFERENCES vehicles(id),
  price_plan_id      UUID NOT NULL REFERENCES price_plans(id),
  route_family_id    UUID REFERENCES route_families(id),
  engine_version     TEXT NOT NULL,
  inputs             JSONB NOT NULL,
  breakdown          JSONB NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'GEL',
  gross_minor        BIGINT NOT NULL,
  commission_rate_bps INTEGER NOT NULL,
  commission_minor   BIGINT NOT NULL,
  driver_net_minor   BIGINT NOT NULL,
  display_currency   TEXT,
  display_rate_micro BIGINT,
  status             quote_status NOT NULL DEFAULT 'OPEN',
  held_until         TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quote_money_nonneg CHECK (gross_minor >= 0 AND commission_minor >= 0 AND driver_net_minor >= 0),
  CONSTRAINT quote_split_balances CHECK (commission_minor + driver_net_minor = gross_minor)
);
CREATE INDEX quotes_search_idx ON quotes (search_id);

-- -------------------------------------------------------------- booking ---
CREATE TABLE bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL UNIQUE,
  customer_user_id    UUID REFERENCES users(id),
  customer_email      TEXT NOT NULL,
  customer_phone      TEXT,
  quote_id            UUID NOT NULL UNIQUE REFERENCES quotes(id),
  driver_id           UUID NOT NULL REFERENCES driver_profiles(id),
  vehicle_id          UUID NOT NULL REFERENCES vehicles(id),
  status              booking_status NOT NULL DEFAULT 'DRAFT',
  payment_mode        payment_mode NOT NULL,
  service_start_at    TIMESTAMPTZ NOT NULL,
  service_tz          TEXT NOT NULL DEFAULT 'Asia/Tbilisi',
  gross_minor         BIGINT NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'GEL',
  commission_rate_bps INTEGER NOT NULL,      -- frozen at booking time
  commission_minor    BIGINT NOT NULL,
  driver_net_minor    BIGINT NOT NULL,
  policy_version      TEXT NOT NULL,
  attribution         JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bookings_service_idx ON bookings (service_start_at);
CREATE INDEX bookings_driver_idx  ON bookings (driver_id, service_start_at);

CREATE TABLE booking_status_history (
  id             BIGSERIAL PRIMARY KEY,
  booking_id     UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status    booking_status,
  to_status      booking_status NOT NULL,
  actor_id       UUID REFERENCES users(id),
  actor_role     app_role,
  reason         TEXT,
  correlation_id TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- audit ---
CREATE TABLE audit_logs (
  id             BIGSERIAL PRIMARY KEY,
  at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id  UUID REFERENCES users(id),
  actor_role     app_role,
  action         TEXT NOT NULL,
  object_type    TEXT NOT NULL,
  object_id      TEXT,
  before         JSONB,
  after          JSONB,
  reason         TEXT,
  correlation_id TEXT,
  ip             TEXT
);
CREATE INDEX audit_logs_object_idx ON audit_logs (object_type, object_id, at DESC);
CREATE INDEX audit_logs_actor_idx  ON audit_logs (actor_user_id, at DESC);

CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- Same protection for the immutable financial/decision trails.
CREATE TRIGGER driver_decisions_no_update BEFORE UPDATE OR DELETE ON driver_decisions
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
CREATE TRIGGER booking_status_history_no_update BEFORE UPDATE OR DELETE ON booking_status_history
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- ------------------------------------------------------------- content ----
CREATE TABLE content_pages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL,
  locale     TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'PAGE',   -- PAGE | ROUTE | FAQ
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  meta_title TEXT,
  meta_desc  TEXT,
  published  BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX content_pages_slug_locale_uq ON content_pages (slug, locale);
