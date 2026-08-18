-- =========================================================================
-- 0004 — operations the business cannot run without
--
-- Adds the accounts and records needed for staff to actually settle money
-- and act on a booking, rather than only observe it.
-- =========================================================================

-- Money the platform actually holds: commission settled by drivers in cash,
-- and the counterpart when we pay a refund out. Without it there is nowhere
-- to post the other side of a settlement.
ALTER TYPE account_kind ADD VALUE IF NOT EXISTS 'PLATFORM_CASH';

-- Support conversations and incidents. A booking that goes wrong needs an
-- owner and a written record, not a memory of a phone call.
CREATE TYPE ticket_state    AS ENUM ('OPEN','WAITING','RESOLVED','CLOSED');
CREATE TYPE ticket_severity AS ENUM ('SEV1','SEV2','SEV3','SEV4');

CREATE TABLE support_tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID REFERENCES bookings(id) ON DELETE SET NULL,
  driver_id    UUID REFERENCES driver_profiles(id) ON DELETE SET NULL,
  subject      TEXT NOT NULL,
  category     TEXT NOT NULL,
  severity     ticket_severity NOT NULL DEFAULT 'SEV3',
  state        ticket_state NOT NULL DEFAULT 'OPEN',
  owner_id     UUID REFERENCES users(id),
  opened_by    UUID REFERENCES users(id),
  resolution   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX support_tickets_open_idx ON support_tickets (state, created_at)
  WHERE state IN ('OPEN','WAITING');
CREATE INDEX support_tickets_booking_idx ON support_tickets (booking_id);

CREATE TABLE support_notes (
  id         BIGSERIAL PRIMARY KEY,
  ticket_id  UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER support_notes_no_update BEFORE UPDATE OR DELETE ON support_notes
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- Staff invitations. A new operations hire needs an account without anyone
-- sharing a password or editing the database by hand.
CREATE TABLE staff_invitations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  roles      TEXT[] NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX staff_invitations_email_open ON staff_invitations (lower(email))
  WHERE accepted_at IS NULL;
