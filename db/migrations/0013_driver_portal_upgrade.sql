-- =========================================================================
-- 0013 — closing the gaps the GoTrip teardown found
--
-- Five things a driver could not do, in the order they hurt:
--
--   1. Read a message a traveller sent them. The channel existed and ran
--      one way: traveller and operations could both read the thread, the
--      driver could not. Nothing is added here for that — messages already
--      has everything — except a cache for translated text, because a
--      Georgian driver and a foreign traveller cannot read each other.
--   2. Ask us for help. support_tickets existed but was staff-only, and
--      support_notes has no notion of who may see a note. Making the
--      existing internal notes visible to drivers would have leaked
--      operational commentary, so visibility is explicit and defaults to
--      internal — the safe direction.
--   3. Say "I never work Sundays" once instead of forever.
--   4. See what has been sent to them without leaving the portal.
--   5. Attach a photo to a problem.
-- =========================================================================

-- ------------------------------------------------------- 1. translation --
-- Machine translation is slow, rate-limited and costs money per call, and
-- the same message gets opened repeatedly. Cache per (message, language);
-- the provider is recorded so a later switch to a better engine can
-- invalidate what an earlier one produced.
CREATE TABLE message_translations (
  message_id    UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  target_locale TEXT NOT NULL,
  body          TEXT NOT NULL,
  provider      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, target_locale),
  CONSTRAINT message_translations_locale_ck CHECK (target_locale IN ('en','ka','ru'))
);

-- --------------------------------------------------------- 2. support ----
-- Who may see a note. Existing rows become internal, which is what they
-- were written as — nobody wrote them expecting a driver to read them.
ALTER TABLE support_notes
  ADD COLUMN visible_to_driver BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN support_notes.visible_to_driver IS
  'False = internal operations note. True = reply the driver sees. Default false: a note is private unless deliberately shared.';

-- Photographs of a damaged seat, a disputed receipt, a fuel bill. Kept in
-- the same restricted bucket as identity documents, never public.
CREATE TABLE support_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  storage_key  TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size    BIGINT NOT NULL,
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_attachments_size_ck CHECK (byte_size > 0 AND byte_size <= 10485760)
);
CREATE INDEX support_attachments_ticket_idx ON support_attachments (ticket_id);

-- A driver opening a ticket needs it to reach the queue with their name on
-- it; opened_by already carries that. This index makes "my tickets" cheap.
CREATE INDEX support_tickets_driver_idx ON support_tickets (driver_id, created_at DESC);

-- ---------------------------------------------- 3. recurring days off ----
-- A weekly pattern, stored once. Concrete availability_blocks are still the
-- single source of truth for whether a driver is free — the EXCLUDE
-- constraint and every search depend on that — so a pattern is materialised
-- into real blocks over a rolling horizon rather than consulted at search
-- time. Two representations, one of them derived, and the derived one is
-- rebuilt from scratch whenever the pattern changes.
CREATE TABLE availability_patterns (
  driver_id  UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  -- 0 = Sunday, matching EXTRACT(DOW).
  weekday    SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id, weekday),
  CONSTRAINT availability_patterns_weekday_ck CHECK (weekday BETWEEN 0 AND 6)
);

COMMENT ON TABLE availability_patterns IS
  'Weekdays a driver never works. Materialised into TIME_OFF blocks over a rolling horizon; blocks remain authoritative.';

-- Marks the blocks that came from a pattern, so regenerating one can delete
-- exactly what it created and never touch a block the driver set by hand or
-- a booking. Partial index: almost every block has this NULL.
ALTER TABLE availability_blocks
  ADD COLUMN from_pattern BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX availability_blocks_pattern_idx
  ON availability_blocks (driver_id) WHERE from_pattern;

-- ------------------------------------------------- 4. notification inbox --
-- The outbox knew an address to send to but not a person to show it to.
-- Both new columns are nullable: a notification to a traveller who has no
-- account still has nobody to attach, and that is fine.
ALTER TABLE notifications
  ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN read_at TIMESTAMPTZ;

CREATE INDEX notifications_user_unread_idx
  ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
