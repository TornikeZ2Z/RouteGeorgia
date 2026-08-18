-- =========================================================================
-- 0003 — guest access to a booking
--
-- Guest checkout is a first-class flow: most travellers book without ever
-- creating an account. Their access to "manage my booking" is a scoped,
-- single-purpose, expiring token — not a login, and not a row in login_tokens
-- pretending to belong to a user that does not exist.
--
-- Only the hash is stored, so a database leak does not hand over live links.
-- =========================================================================

CREATE TABLE booking_access_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX booking_access_tokens_booking_idx ON booking_access_tokens (booking_id);
